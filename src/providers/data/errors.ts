/**
 * Errors raised by the data provider layer.
 *
 * @see ../../../docs/provider-pattern.md
 */

/**
 * Thrown by Supabase provider stubs (and any future provider that is not yet
 * wired). The message must clearly identify the provider, the method and the
 * future PRD that will implement it so debugging the failure is unambiguous.
 *
 * @example
 *   throw new NotImplementedError(
 *     "SupabaseCustomersProvider.list — implementar no PRD-110+",
 *   );
 */
export class NotImplementedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotImplementedError";
  }
}
