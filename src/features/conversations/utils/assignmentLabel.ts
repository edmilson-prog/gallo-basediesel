import type { ISeller } from "@/shared/types";

export interface IAssignmentLabelStrings {
  me: string;
  unassigned: string;
  queue: string;
  all: string;
  seller: string;
  selectedCount: (n: number) => string;
}

/** Compose the Atribuição trigger label from the selected tokens. */
export function assignmentTriggerLabel(
  tokens: string[],
  sellers: ISeller[],
  strings: IAssignmentLabelStrings,
): string {
  if (tokens.length === 0) return strings.all;
  if (tokens.length === 1) {
    const token = tokens[0];
    if (token === "me") return strings.me;
    if (token === "unassigned") return strings.unassigned;
    if (token === "queue") return strings.queue;
    return sellers.find((s) => s.id === token)?.fullName ?? strings.seller;
  }
  return strings.selectedCount(tokens.length);
}
