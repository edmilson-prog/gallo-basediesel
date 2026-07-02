-- Original filename of a media message (document label in the bubble/gallery/
-- download). Nullable: legacy rows and media without a client-provided name
-- degrade to the current behavior (name derived from the storage path).
-- Read path needs NO function change: `conversation_messages` and
-- `last_messages_for_conversations` RETURN SETOF public.messages with m.*.
alter table public.messages
  add column if not exists media_filename text;
