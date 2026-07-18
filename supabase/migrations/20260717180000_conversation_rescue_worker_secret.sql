-- Mints CONVERSATION_RESCUE_WORKER_SECRET in Vault (same pattern as
-- SDR_WORKER_SECRET, 20260715130000_sdr_activation_schema.sql).
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'CONVERSATION_RESCUE_WORKER_SECRET') then
    perform vault.create_secret(
      replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
      'CONVERSATION_RESCUE_WORKER_SECRET',
      'Shared secret authenticating conversation-rescue-tick (offline-rescue sub-project B).'
    );
  end if;
end $$;
