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
export const CONNECT_ERROR_MESSAGES: Record<string, string> = {
  UNAUTHORIZED: "A chave de API foi recusada pelo servidor. Confira a apikey.",
  NOT_FOUND: "Instância não encontrada neste servidor. Confira o nome/ID.",
  MISSING_API_KEY: "Salve a chave de API no cofre antes de conectar.",
  CONFIG_MISSING: "Configure a URL do servidor e a instância antes de conectar.",
  DEFAULT:
    "Não conseguimos falar com o servidor Evolution. Verifique se a URL está correta e se o servidor está no ar.",
};

export function connectErrorMessage(error: unknown): string {
  if (error instanceof EvolutionConnectError && error.code) {
    return CONNECT_ERROR_MESSAGES[error.code] ?? CONNECT_ERROR_MESSAGES.DEFAULT;
  }
  return CONNECT_ERROR_MESSAGES.DEFAULT;
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

async function invokeConnect<T>(body: { accountId: string; action: string }): Promise<T> {
  const { data, error } = await getSupabaseClient().functions.invoke<T>("whatsapp-connect", {
    body,
  });
  if (error) throw await toConnectError(error, "Falha ao falar com o servidor.");
  return data as T;
}

const isMock = () => getActiveDataSource() === "mock";

// ===== Public API ============================================================

export async function testEvolutionServer(accountId: string): Promise<IEvolutionTestResponse> {
  if (isMock()) return { ok: true, state: "close" };
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
