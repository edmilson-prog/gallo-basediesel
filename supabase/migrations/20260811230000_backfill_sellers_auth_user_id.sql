-- Re-link every seller to their login (PRD-145 fallout).
--
-- Measured in production on 2026-08-11: of the 8 active sellers, only
-- admin@ailainteligente.com had `sellers.auth_user_id` filled. Every real
-- attendant was NULL — including the one holding 619 open conversations —
-- while `profiles.seller_id` pointed at them correctly the whole time.
--
-- The app maintains the profile → seller direction; this column is the reverse
-- mirror, and nothing kept it in sync. That made Web Push inert for the entire
-- team: `push-dispatch` resolved the recipient through this column and skipped
-- with "assignee has no login" before it ever looked at push_subscriptions.
-- The delivery test that passed did so on the admin — the one seller for whom
-- the path could work — and the success hid the gap.
--
-- Safe to run: verified beforehand that no seller has more than one profile
-- pointing at it, and that no already-filled `auth_user_id` disagrees with its
-- profile. Rows that already match are left untouched by the NULL guard, so
-- this is idempotent.

update public.sellers as s
set auth_user_id = p.auth_user_id
from public.profiles as p
where p.seller_id = s.id
  and p.auth_user_id is not null
  and s.auth_user_id is null;

comment on column public.sellers.auth_user_id is
  'Login that owns this seller. Mirror of profiles.seller_id — keep both in sync when creating or re-linking a user, or server-side features that resolve a recipient from a seller (Web Push) silently skip them.';
