/**
 * Naming for a kit copied from one canonical model to another. A filter kit that
 * serves a D13K460 usually serves the D13K500 with no change — the copy is the
 * common move, and the name has to follow the destination engine instead of
 * lying about the source.
 */

export interface IKitRenameTarget {
  model: string;
  engine: string;
}

export function renameKitForModel(
  name: string,
  from: IKitRenameTarget,
  to: IKitRenameTarget,
): string {
  const trimmed = name.trim();
  if (from.engine && to.engine && trimmed.includes(from.engine)) {
    return trimmed.replace(from.engine, to.engine);
  }
  if (from.model && trimmed.includes(from.model)) {
    return trimmed.replace(from.model, `${to.model} ${to.engine}`.trim());
  }
  return `${trimmed} — ${`${to.model} ${to.engine}`.trim()}`;
}
