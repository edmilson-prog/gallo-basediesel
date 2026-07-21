-- WhatsApp reactions attach to an existing message rather than creating a new
-- one, so they live on the reacted row. A 1:1 conversation has at most two
-- reactors, so a two-slot object is enough — no separate table, no join on the
-- hot read path.
--
--   {"customer": {"emoji": "👍", "at": "2026-07-21T13:10:00Z"},
--    "seller":   {"emoji": "❤️", "at": "..."}}
--
-- NULL means "no reaction" (an empty object is never stored).
-- No index: nothing filters by reaction.
--
-- conversation_messages() needs NO change — it is RETURNS SETOF messages with
-- `select m.*`, so the new column flows through automatically.
alter table public.messages add column if not exists reactions jsonb;

comment on column public.messages.reactions is
  'WhatsApp reactions on this message, keyed by side (customer|seller). NULL when none.';

-- PostgREST caches the schema; without this the new column stays invisible to
-- the API until the next reload.
notify pgrst, 'reload schema';
