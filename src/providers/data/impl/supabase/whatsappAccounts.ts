import { NotImplementedError } from "../../errors";
import type { IWhatsAppAccountsProvider } from "../../contracts/whatsappAccounts";

const stub = (method: string) => () => {
  throw new NotImplementedError(
    `SupabaseWhatsAppAccountsProvider.${method} — implementar no PRD-100+ (provedores WhatsApp via Supabase).`,
  );
};

export const supabaseWhatsAppAccountsProvider: IWhatsAppAccountsProvider = {
  list: stub("list"),
  get: stub("get"),
};
