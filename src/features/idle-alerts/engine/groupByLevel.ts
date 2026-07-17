import type { IIdleConversationEntry } from "@/shared/types";

export interface IIdleGroups {
  critical: IIdleConversationEntry[];
  alert: IIdleConversationEntry[];
  attention: IIdleConversationEntry[];
}

export function groupByLevel(entries: IIdleConversationEntry[]): IIdleGroups {
  const groups: IIdleGroups = { critical: [], alert: [], attention: [] };
  for (const e of entries) {
    if (e.level === 3) groups.critical.push(e);
    else if (e.level === 2) groups.alert.push(e);
    else groups.attention.push(e);
  }
  return groups;
}
