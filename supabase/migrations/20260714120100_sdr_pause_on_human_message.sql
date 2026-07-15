-- "Pausa por humano é sagrada" (PRD-020 principle) as a DB guarantee instead
-- of application code: any seller-authored outbound message on a
-- SDR-active conversation atomically turns the SDR off. Covers every send
-- path (present or future) without each one having to remember to do it.
create or replace function public.sdr_pause_on_human_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.direction = 'out' and new.author_type = 'seller' then
    update public.conversations
    set is_sdr_active = false
    where id = new.conversation_id
      and is_sdr_active = true;
  end if;
  return new;
end;
$$;

comment on function public.sdr_pause_on_human_message() is
  'Turns off is_sdr_active the instant a real seller sends a message — the SDR never talks over a human.';

drop trigger if exists trg_sdr_pause_on_human_message on public.messages;
create trigger trg_sdr_pause_on_human_message
  after insert on public.messages
  for each row
  when (new.direction = 'out' and new.author_type = 'seller')
  execute function public.sdr_pause_on_human_message();
