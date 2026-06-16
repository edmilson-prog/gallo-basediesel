export interface IAccessRuleLike {
  kind: string;
  targetValue: string;
}
export interface ISellerLike {
  id: string;
  role: string;
  storeId: string;
}

/** Conjunto ÚNICO de sellers cobertos pelo OU das regras (sem dupla contagem). */
export function resolveAccessRecipients(
  rules: IAccessRuleLike[],
  sellers: ISellerLike[],
): Set<string> {
  const result = new Set<string>();
  for (const s of sellers) {
    const matched = rules.some(
      (r) =>
        (r.kind === "seller" && r.targetValue === s.id) ||
        (r.kind === "role" && r.targetValue === s.role) ||
        (r.kind === "store" && r.targetValue === s.storeId),
    );
    if (matched) result.add(s.id);
  }
  return result;
}
