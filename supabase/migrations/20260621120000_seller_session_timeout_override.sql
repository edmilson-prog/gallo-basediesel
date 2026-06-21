-- Per-user idle session-timeout override (snapshot of ISessionTimeoutSettings).
-- null = inherit the store-global policy. RLS unchanged: the column follows the
-- existing sellers policies (Owner/staff edit the user record).
alter table public.sellers
  add column if not exists session_timeout_override jsonb;

comment on column public.sellers.session_timeout_override is
  'Per-user idle session timeout override (ISessionTimeoutSettings snapshot). null = inherit global.';
