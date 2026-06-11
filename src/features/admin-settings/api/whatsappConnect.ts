import { getActiveDataSource } from "@/providers/data";
import { getSupabaseClient } from "@/shared/lib/supabase";

/**
 * Client surface for the `whatsapp-connect` Edge Function (Evolution QR
 * pairing — spec 2026-06-11). In mock mode every call is simulated locally
 * (deterministic state machine, no network) so the dialog is demoable.
 */

export type EvolutionPairingState = "close" | "connecting" | "open" | "unknown";

export interface IEvolutionQrResponse {
  state: "qr" | "open";
  qrBase64?: string;
  pairingCode?: string;
  expiresInSeconds?: number;
  phoneNumber?: string;
  profileName?: string;
}

export interface IEvolutionStateResponse {
  state: EvolutionPairingState;
  phoneNumber?: string;
  profileName?: string;
}

export interface IEvolutionTestResponse {
  ok: boolean;
  state?: EvolutionPairingState;
}

/** Stable machine codes the edge returns for UX branching. */
export type EvolutionConnectErrorCode =
  | "UNAUTHORIZED"
  | "NOT_FOUND"
  | "MISSING_API_KEY"
  | "CONFIG_MISSING"
  | "PROVIDER_DISCONNECTED"
  | "VALIDATION_ERROR"
  | "INTEGRATION_ERROR";

export class EvolutionConnectError extends Error {
  readonly code?: EvolutionConnectErrorCode;
  constructor(message: string, code?: EvolutionConnectErrorCode) {
    super(message);
    this.name = "EvolutionConnectError";
    this.code = code;
  }
}

/** Spec microcopy per error code (Seção 3 do design). */
export const CONNECT_ERROR_MESSAGES: Partial<Record<EvolutionConnectErrorCode, string>> & {
  DEFAULT: string;
} = {
  UNAUTHORIZED: "A chave de API foi recusada pelo servidor. Confira a apikey.",
  NOT_FOUND: "Instância não encontrada neste servidor. Confira o nome/ID.",
  MISSING_API_KEY: "Salve a chave de API no cofre antes de conectar.",
  CONFIG_MISSING: "Configure a URL do servidor e a instância antes de conectar.",
  PROVIDER_DISCONNECTED:
    "O servidor respondeu, mas o WhatsApp desta instância está desconectado. Gere o QR para reconectar.",
  VALIDATION_ERROR: "Número inválido — informe DDI + DDD + número (ex.: 5554999887766).",
  DEFAULT:
    "Não conseguimos falar com o servidor Evolution. Verifique se a URL está correta e se o servidor está no ar.",
};

export function connectErrorMessage(error: unknown): string {
  if (error instanceof EvolutionConnectError && error.code) {
    return CONNECT_ERROR_MESSAGES[error.code] ?? CONNECT_ERROR_MESSAGES.DEFAULT;
  }
  return CONNECT_ERROR_MESSAGES.DEFAULT;
}

// ===== Credentials-ref validation ===========================================

/**
 * Secret names are `{credentialsRef}_API_KEY` and must satisfy the
 * integration-secrets edge pattern (env-style: starts with an uppercase
 * letter; only A-Z, 0-9 and _). Fase-1 seed refs like
 * `vault://gallo/wa-evo-campanhas` fail this and must be renamed before the
 * apikey can be stored.
 */
const SECRET_NAME_PATTERN = /^[A-Z][A-Z0-9_]{2,64}$/;

export function isValidCredentialsRef(ref: string): boolean {
  return SECRET_NAME_PATTERN.test(`${ref}_API_KEY`);
}

export const INVALID_CREDENTIALS_REF_MESSAGE =
  "Prefixo de credenciais inválido para nomear o secret — use apenas letras maiúsculas, números e _ (ex.: WA_EVO_CAMPANHAS).";

/**
 * Normalizes a user-typed phone for the test-message send: strips everything
 * but digits and requires DDI+DDD+number (12–13 digits, e.g. 5554999887766).
 * Returns null when the input cannot be a valid wire number.
 */
export function normalizeTestPhoneDigits(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  return digits.length >= 12 && digits.length <= 13 ? digits : null;
}

/**
 * Progressive display mask for the test-message phone input:
 * `5554999887766` → `+55 54 99988-7766` (hyphen always before the last 4
 * digits of the local number; works for 8- and 9-digit numbers). Pure —
 * callers strip with {@link normalizeTestPhoneDigits} before sending.
 */
export function formatTestPhoneMask(input: string): string {
  const digits = input.replace(/\D/g, "").slice(0, 13);
  if (digits.length === 0) return "";
  let out = `+${digits.slice(0, 2)}`;
  const ddd = digits.slice(2, 4);
  if (ddd) out += ` ${ddd}`;
  const local = digits.slice(4);
  if (local) {
    const hyphenAt = local.length > 4 ? local.length - 4 : 0;
    out += ` ${hyphenAt > 0 ? `${local.slice(0, hyphenAt)}-${local.slice(hyphenAt)}` : local}`;
  }
  return out;
}

// ===== Mock simulation =======================================================

/** ms after pairing start → simulated session state (exported for tests). */
export function resolveMockPairingState(elapsedMs: number): IEvolutionStateResponse {
  if (elapsedMs < 2500) return { state: "close" };
  if (elapsedMs < 5000) return { state: "connecting" };
  return {
    state: "open",
    phoneNumber: "+5555999887766",
    profileName: "Gallo Base Diesel (demo)",
  };
}

/** Fake scannable-looking QR (SVG data URI) for demo mode. */
const MOCK_QR_BASE64 =
  "data:image/svg+xml;base64," +
  btoa(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 33 33" width="264" height="264">` +
      `<rect width="33" height="33" fill="#fff"/>` +
      `<path fill="#000" fill-rule="evenodd" d="M0 0h7v7H0zm2 2h3v3H2zM26 0h7v7h-7zm2 2h3v3h-3zM0 26h7v7H0zm2 2h3v3H2z"/>` +
      `<path fill="#000" d="M9 1h2v2H9zm4-1h2v2h-2zm4 2h2v2h-2zm4-1h2v2h-2zM1 9h2v2H1zm8 0h2v2H9zm9 0h2v2h-2zm9 0h2v2h-2zM3 13h2v2H3zm9 0h2v2h-2zm9 0h2v2h-2zM1 17h2v2H1zm9 0h2v2h-2zm9 0h2v2h-2zm9 0h2v2h-2zM2 21h2v2H2zm10 0h2v2h-2zm10 0h2v2h-2zM9 26h2v2H9zm9 0h2v2h-2zm8 0h2v2h-2zm-15 4h2v2h-2zm10 0h2v2h-2z"/>` +
      `</svg>`,
  );

const mockPairingStartedAt = new Map<string, number>();

// ===== Edge invocation =======================================================

async function toConnectError(error: unknown, fallback: string): Promise<EvolutionConnectError> {
  const ctx = (error as { context?: Response }).context;
  if (ctx && typeof ctx.json === "function") {
    try {
      const body = (await ctx.json()) as { error?: string; code?: string };
      if (body?.error) {
        return new EvolutionConnectError(body.error, body.code as EvolutionConnectErrorCode);
      }
    } catch {
      /* fall through */
    }
  }
  return new EvolutionConnectError(error instanceof Error ? error.message : fallback);
}

async function invokeConnect<T>(body: {
  accountId: string;
  action: string;
  to?: string;
}): Promise<T> {
  const { data, error } = await getSupabaseClient().functions.invoke<T>("whatsapp-connect", {
    body,
  });
  if (error) throw await toConnectError(error, "Falha ao falar com o servidor.");
  return data as T;
}

const isMock = () => getActiveDataSource() === "mock";

// ===== Public API ============================================================

export async function testEvolutionServer(accountId: string): Promise<IEvolutionTestResponse> {
  if (isMock()) {
    const startedAt = mockPairingStartedAt.get(accountId);
    return {
      ok: true,
      state:
        startedAt === undefined ? "close" : resolveMockPairingState(Date.now() - startedAt).state,
    };
  }
  return invokeConnect<IEvolutionTestResponse>({ accountId, action: "test" });
}

export async function requestEvolutionQr(accountId: string): Promise<IEvolutionQrResponse> {
  if (isMock()) {
    mockPairingStartedAt.set(accountId, Date.now());
    return { state: "qr", qrBase64: MOCK_QR_BASE64, expiresInSeconds: 30 };
  }
  return invokeConnect<IEvolutionQrResponse>({ accountId, action: "qr" });
}

export async function getEvolutionState(accountId: string): Promise<IEvolutionStateResponse> {
  if (isMock()) {
    const startedAt = mockPairingStartedAt.get(accountId);
    if (startedAt === undefined) return { state: "close" };
    return resolveMockPairingState(Date.now() - startedAt);
  }
  return invokeConnect<IEvolutionStateResponse>({ accountId, action: "state" });
}

export async function logoutEvolution(accountId: string): Promise<void> {
  if (isMock()) {
    mockPairingStartedAt.delete(accountId);
    return;
  }
  await invokeConnect<{ ok: boolean }>({ accountId, action: "logout" });
}

export async function restartEvolution(accountId: string): Promise<void> {
  if (isMock()) return;
  await invokeConnect<{ ok: boolean }>({ accountId, action: "restart" });
}

/** Ad-hoc validation send — never persisted as a conversation message. */
export async function sendEvolutionTestMessage(accountId: string, toDigits: string): Promise<void> {
  if (isMock()) {
    await new Promise((resolve) => setTimeout(resolve, 600));
    return;
  }
  await invokeConnect<{ ok: boolean }>({ accountId, action: "test-message", to: toDigits });
}
