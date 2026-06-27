/**
 * Contact profile-photo sync — single source of truth for both the manual
 * "Sincronizar fotos" button (whatsapp-avatar-sync) and the automatic
 * background fetch on a brand-new inbound contact (whatsapp-webhook).
 *
 * Given one contact, it asks the Evolution instance for the profile-picture
 * URL, downloads the bytes, mirrors them to the PUBLIC `avatars` bucket at
 * `avatars/<storeId>/<customerId>.jpg`, and stamps customers.avatar_url (+
 * avatar_synced_at). A contact with no public photo / a private one (or any
 * failure) just gets avatar_synced_at stamped — so a re-run never re-attempts
 * it and the manual drain always moves forward. Best-effort by contract: it
 * never throws; the webhook path can fire-and-forget it safely.
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.107.0";
import {
  fetchProfilePictureUrl,
  type IEvolutionInstanceTarget,
} from "./whatsapp/evolution/instance.ts";
import { E164_REGEX, toE164 } from "./whatsapp/phone.ts";
import type { IEngineDeps } from "./whatsapp/types.ts";

/** Public Storage bucket holding mirrored profile photos (CDN URL, no signing). */
export const AVATARS_BUCKET = "avatars";

export type AvatarSyncResult = "with-photo" | "without-photo" | "failed";

export interface IAvatarContact {
  id: string;
  phone: string;
  storeId: string;
}

export interface ISyncContactAvatarOptions {
  traceId?: string;
  warn?: (msg: string, fields?: Record<string, unknown>) => void;
}

/**
 * Syncs one contact's WhatsApp profile photo into the `avatars` bucket.
 * Always stamps avatar_synced_at (idempotency), sets avatar_url only on a hit.
 * Never throws — returns a coarse result the caller can count or ignore.
 *
 * `fetchPicUrl` lets a caller inject an engine-specific picture-URL resolver
 * (e.g. Evolution Go's `/user/avatar`). When omitted, it falls back to the
 * classic Evolution fetch using `(apiKey, target)` — so existing callers stay
 * byte-compatible; only Go callers pass the override.
 */
export async function syncContactAvatar(
  admin: SupabaseClient,
  deps: IEngineDeps,
  target: IEvolutionInstanceTarget,
  apiKey: string,
  contact: IAvatarContact,
  opts?: ISyncContactAvatarOptions,
  fetchPicUrl?: (wireNumber: string, traceId?: string) => Promise<string | null>,
): Promise<AvatarSyncResult> {
  const stamp = () =>
    admin
      .from("customers")
      .update({ avatar_synced_at: new Date().toISOString() })
      .eq("id", contact.id);

  try {
    const e164 = toE164(contact.phone);
    if (!E164_REGEX.test(e164)) {
      await stamp();
      return "without-photo";
    }
    const wire = e164.slice(1);
    const picUrl = fetchPicUrl
      ? await fetchPicUrl(wire, opts?.traceId)
      : await fetchProfilePictureUrl(apiKey, deps, target, wire, opts?.traceId);
    if (!picUrl) {
      await stamp();
      return "without-photo";
    }
    const downloaded = await fetch(picUrl).catch(() => null);
    if (!downloaded || !downloaded.ok) {
      await stamp();
      return "without-photo";
    }
    const bytes = new Uint8Array(await downloaded.arrayBuffer());
    const contentType = downloaded.headers.get("content-type") ?? "image/jpeg";
    const path = `${contact.storeId}/${contact.id}.jpg`;
    const { error: uploadError } = await admin.storage
      .from(AVATARS_BUCKET)
      .upload(path, bytes, { contentType, upsert: true });
    if (uploadError) throw new Error(`upload: ${uploadError.message}`);
    const publicUrl = admin.storage.from(AVATARS_BUCKET).getPublicUrl(path).data.publicUrl;
    // Cache-buster: the Storage path is stable (<storeId>/<customerId>.jpg), so a
    // contact who CHANGES their photo would otherwise keep serving the cached
    // image. A fresh ?v= on every successful sync forces the browser to refetch.
    const versionedUrl = `${publicUrl}?v=${Date.now()}`;
    await admin
      .from("customers")
      .update({ avatar_url: versionedUrl, avatar_synced_at: new Date().toISOString() })
      .eq("id", contact.id);
    return "with-photo";
  } catch (caught) {
    opts?.warn?.("avatar sync failed for contact", {
      customerId: contact.id,
      error: caught instanceof Error ? caught.message : String(caught),
    });
    // Stamp so a re-run drains forward instead of hot-looping a bad row.
    await stamp().then(
      () => {},
      () => {},
    );
    return "failed";
  }
}
