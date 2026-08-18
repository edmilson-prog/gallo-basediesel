import type { IAuditLog, LeadTemperature } from "@/shared/types";
import { formatBRL } from "@/shared/utils/format";
import { TEMPERATURE_META } from "../utils/leadDisplay";

interface IActionMeta {
  icon: string;
  title: string;
}

const ACTION_META: Record<string, IActionMeta> = {
  "lead.created": { icon: "mdi:plus-circle-outline", title: "Lead criado" },
  "lead.stage_changed": { icon: "mdi:swap-horizontal", title: "Mudança de estágio" },
  "lead.updated": { icon: "mdi:pencil-outline", title: "Lead atualizado" },
  "lead.converted": { icon: "mdi:check-decagram", title: "Convertido em cliente" },
  "lead.lost": { icon: "mdi:close-octagon-outline", title: "Marcado como perdido" },
  // Written by the bulk bar, the row actions and the header's inline edits.
  // Without an entry each of these rendered as its raw action string in the
  // timeline — "lead.seller_changed" in a pt-BR interface.
  "lead.seller_changed": { icon: "mdi:account-switch-outline", title: "Responsável alterado" },
  "lead.marked_lost": { icon: "mdi:close-octagon-outline", title: "Marcado como perdido" },
  "lead_funnel_entry.added": { icon: "mdi:source-branch-plus", title: "Adicionado a um funil" },
  "lead_funnel_entry.removed": { icon: "mdi:source-branch-minus", title: "Tirado de um funil" },
  "lead_funnel_entry.stage_changed": { icon: "mdi:swap-horizontal", title: "Mudou de etapa" },
  "lead_funnel_entry.value_changed": {
    icon: "mdi:cash-multiple",
    title: "Valor estimado alterado",
  },
};

const FIELD_LABEL: Record<string, string> = {
  temperature: "Temperatura",
  estimatedValue: "Valor estimado",
  nextActionAt: "Próxima ação",
  nextActionKind: "Tipo da ação",
  sellerId: "Responsável",
  email: "E-mail",
  stage: "Estágio",
  stageId: "Etapa",
  funnelId: "Funil",
  lossReason: "Motivo da perda",
  tags: "Tags",
  name: "Nome",
  phone: "Telefone",
};

/** The four named next actions, so the history reads them as words. */
const NEXT_ACTION_KIND_LABEL: Record<string, string> = {
  ligar: "Ligar agora",
  orcamento: "Enviar orçamento",
  retomar: "Retomar contato",
  visita: "Agendar visita",
};

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

function formatScalar(field: string, value: unknown): string {
  if (value === undefined || value === null || value === "") return "—";
  if (field === "temperature")
    return TEMPERATURE_META[value as LeadTemperature]?.label ?? String(value);
  if (field === "nextActionKind") return NEXT_ACTION_KIND_LABEL[String(value)] ?? String(value);
  if (field === "estimatedValue") return formatBRL(Number(value));
  if (field === "nextActionAt") {
    const d = new Date(String(value));
    return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR");
  }
  if (field === "stage") {
    const s = asRecord(value);
    return typeof s.name === "string" ? s.name : String(value);
  }
  return String(value);
}

function tagsDelta(before: unknown, after: unknown): string[] {
  const b = Array.isArray(before) ? (before as string[]) : [];
  const a = Array.isArray(after) ? (after as string[]) : [];
  const added = a.filter((t) => !b.includes(t)).map((t) => `Tags: + ${t}`);
  const removed = b.filter((t) => !a.includes(t)).map((t) => `Tags: − ${t}`);
  return [...added, ...removed];
}

/** Human-readable rendering of one audit entry: icon + title + per-field lines. */
export function describeLeadAudit(entry: IAuditLog): {
  icon: string;
  title: string;
  lines: string[];
} {
  const meta = ACTION_META[entry.action] ?? { icon: "mdi:history", title: entry.action };
  const before = asRecord(entry.before);
  const after = asRecord(entry.after);
  const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));

  const lines: string[] = [];
  for (const key of keys) {
    if (key === "tags") {
      lines.push(...tagsDelta(before[key], after[key]));
      continue;
    }
    const label = FIELD_LABEL[key] ?? key;
    lines.push(`${label}: ${formatScalar(key, before[key])} → ${formatScalar(key, after[key])}`);
  }
  return { icon: meta.icon, title: meta.title, lines };
}
