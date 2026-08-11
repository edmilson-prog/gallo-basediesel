/**
 * Web Push encryption and VAPID signing, on WebCrypto only.
 *
 * Implements RFC 8291 (`aes128gcm` content encoding) and RFC 8292 (VAPID).
 * Written against the primitives Deno already ships rather than pulling a Node
 * library through a CDN shim: the payload here carries customer message text,
 * so the crypto path is one we want to be able to read end to end.
 */

export interface IPushSubscriptionKeys {
  endpoint: string;
  /** UA public key, base64 (standard or url-safe), raw uncompressed P-256 point. */
  p256dh: string;
  /** UA auth secret, base64 (standard or url-safe), 16 bytes. */
  auth: string;
}

export interface IVapidKeys {
  /** Raw 32-byte private scalar, base64url. */
  privateKey: string;
  /** Raw 65-byte uncompressed public point, base64url. */
  publicKey: string;
  /** `mailto:` or `https:` contact, sent as the JWT `sub` claim. */
  subject: string;
}

export interface IPushSendResult {
  status: number;
  /** True when the push service says this endpoint is gone for good. */
  isExpired: boolean;
  error?: string;
}

const encoder = new TextEncoder();

/* ── base64 helpers ─────────────────────────────────────────────────────── */

export function base64UrlToBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/* ── VAPID ──────────────────────────────────────────────────────────────── */

/**
 * Import the VAPID pair as an ECDSA signing key.
 *
 * WebCrypto has no "raw private scalar" import for EC, so the raw halves are
 * reassembled into a JWK: `d` from the private scalar, `x`/`y` split out of the
 * uncompressed public point (which is `0x04 || x(32) || y(32)`).
 */
async function importVapidSigningKey(keys: IVapidKeys): Promise<CryptoKey> {
  const publicBytes = base64UrlToBytes(keys.publicKey);
  if (publicBytes.length !== 65 || publicBytes[0] !== 0x04) {
    throw new Error("VAPID public key must be a 65-byte uncompressed P-256 point");
  }
  const jwk: JsonWebKey = {
    kty: "EC",
    crv: "P-256",
    // Already base64url — the JWK `d` field wants exactly that encoding.
    d: keys.privateKey,
    x: bytesToBase64Url(publicBytes.slice(1, 33)),
    y: bytesToBase64Url(publicBytes.slice(33, 65)),
    ext: true,
  };
  return await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, [
    "sign",
  ]);
}

/** `Authorization: vapid t=<jwt>, k=<public key>` for one push endpoint. */
export async function buildVapidHeader(endpoint: string, keys: IVapidKeys): Promise<string> {
  const audience = new URL(endpoint).origin;
  const header = { typ: "JWT", alg: "ES256" };
  const payload = {
    aud: audience,
    // 12h: comfortably inside the 24h ceiling RFC 8292 allows.
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    sub: keys.subject,
  };

  const signingInput = `${bytesToBase64Url(encoder.encode(JSON.stringify(header)))}.${bytesToBase64Url(
    encoder.encode(JSON.stringify(payload)),
  )}`;

  const signingKey = await importVapidSigningKey(keys);
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    signingKey,
    encoder.encode(signingInput),
  );

  const jwt = `${signingInput}.${bytesToBase64Url(new Uint8Array(signature))}`;
  return `vapid t=${jwt}, k=${keys.publicKey}`;
}

/* ── RFC 8291 payload encryption ────────────────────────────────────────── */

async function hkdf(
  salt: Uint8Array,
  ikm: Uint8Array,
  info: Uint8Array,
  lengthBytes: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info },
    key,
    lengthBytes * 8,
  );
  return new Uint8Array(bits);
}

/**
 * Encrypt one payload for one subscription.
 *
 * Single-record body, laid out as RFC 8291 §4 requires:
 * `salt(16) || rs(4) || idlen(1) || as_public(65) || ciphertext`.
 */
export async function encryptPushPayload(
  plaintext: string,
  subscription: IPushSubscriptionKeys,
): Promise<Uint8Array> {
  const uaPublic = base64UrlToBytes(subscription.p256dh);
  const authSecret = base64UrlToBytes(subscription.auth);

  const localKeys = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
    "deriveBits",
  ]);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", localKeys.publicKey));

  const uaPublicKey = await crypto.subtle.importKey(
    "raw",
    uaPublic,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "ECDH", public: uaPublicKey }, localKeys.privateKey, 256),
  );

  // PRK for this subscription: binds the shared secret to both public keys, so
  // a payload encrypted for one device cannot be replayed at another.
  const keyInfo = concat(encoder.encode("WebPush: info\0"), uaPublic, asPublic);
  const ikm = await hkdf(authSecret, sharedSecret, keyInfo, 32);

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, encoder.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, encoder.encode("Content-Encoding: nonce\0"), 12);

  const contentKey = await crypto.subtle.importKey("raw", cek, { name: "AES-GCM" }, false, [
    "encrypt",
  ]);
  // 0x02 is the record delimiter marking this as the LAST record.
  const padded = concat(encoder.encode(plaintext), new Uint8Array([0x02]));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce, tagLength: 128 }, contentKey, padded),
  );

  const recordSize = new Uint8Array(4);
  new DataView(recordSize.buffer).setUint32(0, 4096, false);

  return concat(salt, recordSize, new Uint8Array([asPublic.length]), asPublic, ciphertext);
}

/* ── delivery ───────────────────────────────────────────────────────────── */

/** Payload cap from PRD-145 RF-004 — beyond this some push services reject. */
export const PUSH_PAYLOAD_MAX_BYTES = 3072;

export async function sendWebPush(
  subscription: IPushSubscriptionKeys,
  payload: string,
  vapid: IVapidKeys,
  ttlSeconds = 3600,
): Promise<IPushSendResult> {
  if (encoder.encode(payload).length > PUSH_PAYLOAD_MAX_BYTES) {
    return { status: 0, isExpired: false, error: "payload too large" };
  }

  try {
    const body = await encryptPushPayload(payload, subscription);
    const authorization = await buildVapidHeader(subscription.endpoint, vapid);

    const response = await fetch(subscription.endpoint, {
      method: "POST",
      headers: {
        Authorization: authorization,
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        TTL: String(ttlSeconds),
      },
      body,
    });

    // 404/410 mean the endpoint is gone: the caller deletes the row rather than
    // keeping a zombie that reports "sent" and never delivers.
    const isExpired = response.status === 404 || response.status === 410;
    return {
      status: response.status,
      isExpired,
      error: response.ok ? undefined : await response.text().catch(() => undefined),
    };
  } catch (error) {
    return {
      status: 0,
      isExpired: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
