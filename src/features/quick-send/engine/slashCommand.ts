import type { AssetCategory, IQuickReply } from "@/shared/types";

/**
 * Slash-command → asset category map (PRD-027 RF-007): `/catalogo`, `/tabela`,
 * `/garantia`, `/loja` pre-filter the picker by category. Any other command
 * word is unrecognized.
 */
const SLASH_COMMAND_CATEGORY: Record<string, AssetCategory> = {
  catalogo: "catalogo",
  tabela: "tabela_preco",
  garantia: "garantia",
  loja: "link",
};

export function resolveSlashCommandCategory(command: string): AssetCategory | undefined {
  if (!command) return undefined;
  return SLASH_COMMAND_CATEGORY[command.toLowerCase()];
}

/**
 * Whether the asset picker should show results for this command: either
 * browsing (bare "/", empty command) or a recognized category command.
 * An unrecognized non-empty command (RF-007 error scenario, e.g. "/xyz")
 * shows no assets instead of falling back to an unfiltered browse list.
 */
export function isKnownSlashAssetCommand(command: string): boolean {
  return command === "" || resolveSlashCommandCategory(command) !== undefined;
}

/**
 * Quick replies matched by shortcut prefix (RF-011: insert by `/shortcut`).
 * An empty command means "browse" — return every reply. A non-empty command
 * matches replies whose shortcut starts with "/<command>", case-insensitive,
 * so "/gar" already surfaces "/garantia" while typing.
 */
export function matchQuickRepliesByCommand(
  replies: IQuickReply[],
  command: string,
): IQuickReply[] {
  if (!command) return replies;
  const needle = `/${command.toLowerCase()}`;
  return replies.filter((r) => r.shortcut.toLowerCase().startsWith(needle));
}

/** Minimal shape the PIX matcher needs — avoids pulling IPixKey into this engine. */
export interface ISlashPixKey {
  id: string;
  alias: string;
  shortcut?: string;
}

/** The command that opens the PIX picker regardless of a key's own shortcut. */
const PIX_COMMAND = "pix";

/**
 * PIX keys surfaced by the slash menu (RF: `/pix`).
 *
 * Browsing (empty command) and anything on the way to `/pix` list EVERY key —
 * the attendant chooses in the staged bar, so a key without its own shortcut
 * must still be reachable. Once the command grows past `/pix`, it narrows by
 * each key's own shortcut prefix, so `/pix-mat` already surfaces `/pix-matriz`
 * while leaving shortcut-less keys out (they cannot match a longer command).
 */
export function matchPixKeysByCommand<T extends ISlashPixKey>(keys: T[], command: string): T[] {
  if (!command) return keys;
  const needle = command.toLowerCase();
  // Still typing "/p", "/pi", "/pix" — show everything.
  if (PIX_COMMAND.startsWith(needle)) return keys;
  // Not a PIX command at all.
  if (!needle.startsWith(PIX_COMMAND)) return [];
  return keys.filter((k) => k.shortcut?.toLowerCase().startsWith(`/${needle}`));
}
