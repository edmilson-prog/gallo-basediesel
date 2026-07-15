-- supabase/migrations/20260715120000_messages_transcription_columns.sql
-- Transcrição automática de áudios inbound (OpenRouter). Additive + idempotent.
-- transcription_status NULL = "não se aplica" (mensagem antiga, não-áudio, ou
-- funcionalidade desligada no momento do recebimento) — a bolha não mostra
-- nenhuma legenda nesse caso. Sem mudança de RLS: as policies messages_select/
-- insert/update/delete já delegam para can_access_conversation(conversation_id)
-- (20260615130400_whatsapp_multi_rls_delegate.sql), que cobre a linha inteira.

alter table public.messages
  add column if not exists transcription text,
  add column if not exists transcription_status text
    check (transcription_status in ('pending', 'done', 'failed'));

comment on column public.messages.transcription is
  'Texto transcrito do áudio inbound via OpenRouter (audio_transcription feature). NULL até a transcrição terminar ou se não se aplica.';
comment on column public.messages.transcription_status is
  'pending = transcrevendo; done = transcription preenchido; failed = erro/orçamento/desligado após tentativa; NULL = não se aplica.';
