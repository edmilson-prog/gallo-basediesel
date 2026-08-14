export interface IKitEditorSearch {
  /** Catalog part carried in from the model ficha ("Incluir no kit"). */
  addPartId?: string;
}

/** Search validator shared by the create and edit kit routes. */
export function validateKitEditorSearch(raw: Record<string, unknown>): IKitEditorSearch {
  const out: IKitEditorSearch = {};
  if (typeof raw.addPartId === "string" && raw.addPartId.length > 0) out.addPartId = raw.addPartId;
  return out;
}
