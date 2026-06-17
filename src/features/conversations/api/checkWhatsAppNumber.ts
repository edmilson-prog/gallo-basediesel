import { getActiveDataSource } from "@/providers/data";
import { getSupabaseClient } from "@/shared/lib/supabase";
import type { ID } from "@/shared/types";

export type NumberCheckStatus = "has_whatsapp" | "no_whatsapp" | "skipped";

export interface INumberCheckResult {
  status: NumberCheckStatus;
  /** Canonical phone digits (55…) the WhatsApp network reports, when has_whatsapp. */
  canonicalPhone?: string;
}

export interface IEdgeResponse {
  exists: boolean;
  canonicalPhone: string | null;
}

/**
 * Pure mapping from the edge outcome to a UX decision. ANY error code is a soft
 * skip: Meta accounts, offline instances and infra errors must let the seller
 * proceed with the typed number — only a definitive `exists:false` blocks (D6).
 */
export function classifyNumberCheck(
  data: IEdgeResponse | null,
  errorCode: string | null,
): INumberCheckResult {
  if (errorCode !== null) return { status: "skipped" };
  if (data?.exists) {
    return { status: "has_whatsapp", canonicalPhone: data.canonicalPhone ?? undefined };
  }
  if (data) return { status: "no_whatsapp" };
  return { status: "skipped" };
}

/** Reads the `{ code }` from a functions.invoke error envelope, when present. */
async function readEdgeCode(error: unknown): Promise<string> {
  const ctx = (error as { context?: Response }).context;
  if (ctx && typeof ctx.json === "function") {
    try {
      const b = (await ctx.json()) as { code?: string };
      if (b?.code) return b.code;
    } catch {
      /* fall through */
    }
  }
  return "UNKNOWN";
}

/**
 * Does `phoneDigits` (55…) have a WhatsApp account, via the Evolution instance
 * behind `accountId`? Mock mode resolves to `skipped` so the dialog stays demoable.
 */
export async function checkWhatsAppNumber(
  accountId: ID,
  phoneDigits: string,
): Promise<INumberCheckResult> {
  if (getActiveDataSource() === "mock") return { status: "skipped" };
  try {
    const { data, error } = await getSupabaseClient().functions.invoke<IEdgeResponse>(
      "whatsapp-check-number",
      { body: { accountId, phone: phoneDigits } },
    );
    if (error) return classifyNumberCheck(null, await readEdgeCode(error));
    return classifyNumberCheck(data ?? null, null);
  } catch {
    return { status: "skipped" };
  }
}
