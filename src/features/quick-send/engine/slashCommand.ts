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
