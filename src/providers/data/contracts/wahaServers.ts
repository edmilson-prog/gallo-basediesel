import type { ID, IWahaServer } from "@/shared/types";

export interface ICreateWahaServerInput {
  name: string;
  baseUrl: string;
  /** Vault secret name (pointer) for the global X-Api-Key. */
  apiKeyRef: string;
}

export interface IWahaServerPatch {
  name?: string;
  baseUrl?: string;
}

/**
 * Registry of WAHA servers (platform-level, Owner-only at the RLS layer).
 * Table-only: the API key and webhook HMAC secret live in the Vault and are
 * written/rotated by the Chaves screen through the `integration-secrets` Edge
 * Function, never here. `remove` is guarded by the FK
 * `whatsapp_accounts.waha_server_id` (ON DELETE RESTRICT) — deleting a
 * server with linked sessions fails.
 */
export interface IWahaServersProvider {
  list(): Promise<IWahaServer[]>;
  create(input: ICreateWahaServerInput): Promise<IWahaServer>;
  update(id: ID, patch: IWahaServerPatch): Promise<IWahaServer>;
  /** Sets or clears (pass null) the webhook HMAC secret pointer. */
  setWebhookHmacRef(id: ID, hmacRef: string | null): Promise<IWahaServer>;
  remove(id: ID): Promise<void>;
}
