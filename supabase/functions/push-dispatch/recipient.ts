/**
 * Which login owns a seller — the question `push-dispatch` has to answer before
 * it can find anyone's subscriptions.
 *
 * `profiles.seller_id` is the direction the application maintains;
 * `sellers.auth_user_id` is a reverse mirror that nothing kept in sync. Measured
 * in production on 2026-08-11: of 8 active sellers only one had the column
 * filled, so the dispatch skipped every real attendant with "assignee has no
 * login" before it ever read a subscription — including the one holding 619 open
 * conversations. The delivery test that passed ran on that single linked seller,
 * and the success hid the gap.
 *
 * So: ask the profile first, keep the column as a fallback for a seller whose
 * profile row is missing. Extracted from index.ts so the precedence is covered
 * by a test instead of by a deploy.
 */

/** The slice of the Supabase client this module needs — kept structural so the
 *  test can pass a fake without pulling the Deno-only client into Vitest. */
export interface IRecipientReader {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (
        column: string,
        value: string,
      ) => {
        maybeSingle: () => Promise<{
          data: { auth_user_id?: string | null } | null;
          error: { message: string } | null;
        }>;
      };
    };
  };
}

async function readAuthUserId(
  db: IRecipientReader,
  table: string,
  column: string,
  value: string,
): Promise<string | null> {
  const { data, error } = await db
    .from(table)
    .select("auth_user_id")
    .eq(column, value)
    .maybeSingle();
  if (error) throw new Error(`${table} read failed: ${error.message}`);
  return data?.auth_user_id ?? null;
}

export async function resolveRecipient(
  db: IRecipientReader,
  sellerId: string,
): Promise<string | null> {
  const fromProfile = await readAuthUserId(db, "profiles", "seller_id", sellerId);
  if (fromProfile) return fromProfile;
  return readAuthUserId(db, "sellers", "id", sellerId);
}
