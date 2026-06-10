-- PRD-105 (Realtime core) — broadcast postgres_changes for the inbox surface.
-- RLS scopes events server-side: a subscriber only receives changes for rows
-- their SELECT policies allow (per-seller carteira + unassigned pool; staff
-- store-wide). The client subscribes via src/shared/lib/realtime.ts.
alter publication supabase_realtime add table public.conversations;
alter publication supabase_realtime add table public.messages;
