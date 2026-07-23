/**
 * One-off rollout: re-subscribes every already-connected WAHA session to the
 * `message.reaction` webhook event (added to WAHA_DEFAULT_EVENTS by this
 * change) so customer reactions start flowing for accounts created BEFORE
 * the change — new sessions already pick it up via createWahaSession.
 *
 * Reuses `updateWahaSessionConfig` (PUT /api/sessions/{name}) with each
 * account's EXISTING sessionConfig (read back from provider_config.waha) —
 * no filter/proxy/debug setting is altered, only the webhook event list
 * (driven entirely by the WAHA_DEFAULT_EVENTS constant baked into
 * buildWahaConfig, not passed here). Sequential, best-effort: a failure on
 * one account is logged and does not stop the rest.
 *
 * Queries ALL `provider = 'waha'` accounts (not just `status = 'connected'`)
 * so a momentarily disconnected instance is still named and counted as
 * SKIPPED, instead of silently vanishing from both the loop and the summary
 * — it stays on the old webhook event list until this script is re-run
 * against it. Exits non-zero whenever anything failed or was skipped.
 *
 * Usage:
 *   SUPABASE_URL=https://<ref>.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=<service role key> \
 *   bun run scripts/waha-resubscribe-reactions.ts
 */
import { createClient } from "@supabase/supabase-js";
import {
  updateWahaSessionConfig,
  type IWahaSessionSettings,
} from "../src/providers/whatsapp/waha/session";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY environment variables.");
  process.exit(1);
}

const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

async function resolveSecret(name: string): Promise<string | undefined> {
  const { data, error } = await admin.rpc("integration_secret_get", { p_name: name });
  if (error || typeof data !== "string" || data.length === 0) return undefined;
  return data;
}

interface IAccountRow {
  id: string;
  label: string;
  provider_config: { sessionName?: string; waha?: IWahaSessionSettings } | null;
  waha_server_id: string | null;
  status: string;
}

// Fetch EVERY waha account, not just `connected` ones. Filtering the query
// itself (the previous `.eq("status", "connected")`) made a momentarily
// disconnected instance disappear from BOTH the loop below and the final
// tally — `Done. N succeeded, M failed.` would then report total success
// while that instance silently kept subscribing to the OLD event list
// forever. Partition instead, so a disconnected instance is always
// accounted for and named in the summary.
const { data: accounts, error: accountsError } = await admin
  .from("whatsapp_accounts")
  .select("id, label, provider_config, waha_server_id, status")
  .eq("provider", "waha");
if (accountsError) {
  console.error(`Failed to list WAHA accounts: ${accountsError.message}`);
  process.exit(1);
}

const webhookUrl = `${supabaseUrl}/functions/v1/waha-webhook`;
let ok = 0;
let failed = 0;
const skipped: IAccountRow[] = [];
const connectable: IAccountRow[] = [];
for (const raw of accounts ?? []) {
  const account = raw as IAccountRow;
  if (account.status === "connected") connectable.push(account);
  else skipped.push(account);
}

for (const account of connectable) {
  const sessionName = account.provider_config?.sessionName;
  if (!sessionName) {
    console.warn(`Skipping ${account.label} (${account.id}): no sessionName in provider_config.`);
    failed++;
    continue;
  }
  if (!account.waha_server_id) {
    console.warn(`Skipping ${account.label} (${account.id}): no waha_server_id.`);
    failed++;
    continue;
  }
  const { data: server, error: serverError } = await admin
    .from("waha_servers")
    .select("base_url, api_key_ref, webhook_hmac_ref")
    .eq("id", account.waha_server_id)
    .maybeSingle();
  if (serverError || !server) {
    console.warn(`Skipping ${account.label} (${account.id}): waha_servers row not found.`);
    failed++;
    continue;
  }
  const baseUrl = String(server.base_url ?? "").replace(/\/+$/, "");
  const apiKey = await resolveSecret(String(server.api_key_ref ?? ""));
  const hmacKey = await resolveSecret(String(server.webhook_hmac_ref ?? ""));
  if (!baseUrl || !apiKey || !hmacKey) {
    console.warn(`Skipping ${account.label} (${account.id}): server/secrets not fully configured.`);
    failed++;
    continue;
  }
  try {
    await updateWahaSessionConfig(apiKey, fetch, {
      baseUrl,
      sessionName,
      webhookUrl,
      hmacKey,
      settings: account.provider_config?.waha,
    });
    console.log(`OK: ${account.label} (${account.id}) re-subscribed to message.reaction.`);
    ok++;
  } catch (err) {
    console.warn(
      `Failed: ${account.label} (${account.id}): ${err instanceof Error ? err.message : String(err)}`,
    );
    failed++;
  }
}

for (const account of skipped) {
  console.warn(
    `SKIPPED: ${account.label} (${account.id}) status=${account.status} — re-run this script after the instance reconnects`,
  );
}

console.log(`Done. ${ok} ok, ${failed} failed, ${skipped.length} skipped.`);
if (failed + skipped.length > 0) {
  console.error(
    "Some accounts were not re-subscribed — skipped instances keep receiving the OLD webhook event list until this script is re-run against them.",
  );
  process.exit(1);
}
