// Pure pilot-gate filter — no I/O. 2026-07-20 incident follow-up: this tick
// used to process escalations from ANY store/instance; it now honors the
// same store+instance opt-in gates Parte C added to sdr-backstop-tick and
// sdr-respond. Unknown conversation, missing instance, or either gate off
// → skipped (fails closed).
export interface IGateContext {
  storeIdByConv: Map<string, string>;
  accountIdByConv: Map<string, string | null>;
  enabledStoreIds: Set<string>;
  enabledAccountIds: Set<string>;
}

export function filterByPilotGates<T extends { conversation_id: string }>(
  escalations: T[],
  gates: IGateContext,
): { passed: T[]; skippedCount: number } {
  const passed = escalations.filter((escalation) => {
    const storeId = gates.storeIdByConv.get(escalation.conversation_id);
    const accountId = gates.accountIdByConv.get(escalation.conversation_id);
    return (
      storeId !== undefined &&
      gates.enabledStoreIds.has(storeId) &&
      accountId !== null &&
      accountId !== undefined &&
      gates.enabledAccountIds.has(accountId)
    );
  });
  return { passed, skippedCount: escalations.length - passed.length };
}
