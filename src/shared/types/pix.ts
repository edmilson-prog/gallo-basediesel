/**
 * PIX shortcut — store-owned PIX keys used by the conversation quick-send
 * shortcut (design 2026-08-07). A key belongs to the store, not the seller who
 * created it: sending a company PIX key is a routine action, but *registering*
 * one is a fraud surface, so only staff (Owner/Gestor) may write.
 */
import type { ID, ISO8601 } from "./common";

export type PixKeyType = "cnpj" | "cpf" | "phone" | "email" | "random";

export interface IPixKey {
  id: ID;
  storeId: ID;
  /** Operational nickname — "Matriz — CNPJ", "Filial Palmeira". */
  alias: string;
  keyType: PixKeyType;
  /** CANONICAL form — this is what goes to the clipboard, the message and the
   *  BR Code. Never the formatted display value. */
  keyValue: string;
  /** BR Code receiver — max 25 ASCII characters. */
  receiverName: string;
  /** BR Code city — max 15 ASCII characters. */
  receiverCity: string;
  /** Default text that accompanies the send; editable in the staged bar. */
  defaultContext?: string;
  /** Optional shortcut, e.g. "/pix-matriz". */
  shortcut?: string;
  defaultSendText: boolean;
  defaultSendQr: boolean;
  isDefault: boolean;
  isActive: boolean;
  createdBy: ID;
  createdAt: ISO8601;
  updatedAt: ISO8601;
}

export interface IPixKeyProvider {
  list(params: { storeId?: ID; activeOnly?: boolean }): Promise<IPixKey[]>;
  get(id: ID): Promise<IPixKey | null>;
  create(input: Omit<IPixKey, "id" | "storeId" | "createdAt" | "updatedAt">): Promise<IPixKey>;
  update(id: ID, patch: Partial<IPixKey>): Promise<IPixKey>;
  delete(id: ID): Promise<IPixKey>;
}
