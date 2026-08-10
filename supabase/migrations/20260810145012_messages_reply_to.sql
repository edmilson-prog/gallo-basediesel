-- Reply/quote (citação) de mensagem — spec docs/superpowers/specs/2026-08-10-conversation-reply-quote-design.md
--
-- Snapshot desnormalizado da mensagem citada. Guardado como jsonb (mesmo
-- padrão de messages.reactions e conversations.ad_referral) para que a bolha
-- renderize sem consulta extra: a leitura de mensagens passa pela RPC
-- conversation_messages (SETOF messages, select m.*), que já devolve a coluna
-- nova sem precisar ser recriada.
--
-- Coluna nullable sem default: ALTER é metadata-only, sem reescrita da tabela
-- nem lock longo — a tabela é quente (~1M linhas, ~100k mensagens/mês).
--
-- Forma:
--   {
--     "messageId": "<uuid da nossa mensagem>",      -- ausente quando órfã
--     "providerMessageId": "false_555…@lid_A55…",
--     "text": "trecho já truncado",
--     "mediaType": "image",
--     "direction": "in"
--   }

alter table public.messages add column if not exists reply_to jsonb;

comment on column public.messages.reply_to is
  'Snapshot da mensagem citada por esta (reply/quote). messageId ausente = a original não está no nosso histórico: a citação renderiza pelo snapshot, mas não é clicável.';
