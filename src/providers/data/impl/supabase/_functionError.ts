/** Extracts the pt-BR `{ error }` message from a failed Edge Function invoke. */
export async function extractFunctionError(error: unknown): Promise<string> {
  const ctx = (error as { context?: Response }).context;
  if (ctx && typeof ctx.json === "function") {
    try {
      const body = (await ctx.json()) as { error?: string };
      if (body?.error) return body.error;
    } catch {
      /* fall through */
    }
  }
  return error instanceof Error ? error.message : "[supabase] operation failed";
}
