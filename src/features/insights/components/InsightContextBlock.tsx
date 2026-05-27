import { useMemo } from "react";

export interface IInsightContextBlockProps {
  data: Record<string, unknown>;
}

/**
 * Renders the raw `context` payload of an insight as a list of label/value
 * pairs. Keys are deliberately preserved verbatim (already in Portuguese on
 * the engine output) so the source remains transparent.
 */
export function InsightContextBlock({ data }: IInsightContextBlockProps) {
  const entries = useMemo(() => Object.entries(data ?? {}), [data]);
  if (entries.length === 0) {
    return <p className="text-xs text-muted-foreground">Nenhum contexto adicional disponível.</p>;
  }
  return (
    <dl className="grid gap-2 sm:grid-cols-2">
      {entries.map(([key, value]) => (
        <div key={key} className="rounded-sm bg-muted/40 px-3 py-2 text-xs">
          <dt className="font-medium uppercase tracking-wider text-muted-foreground">
            {formatKey(key)}
          </dt>
          <dd className="mt-0.5 break-words text-foreground">{renderValue(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

function formatKey(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/[_-]/g, " ")
    .replace(/^./, (c) => c.toUpperCase());
}

function renderValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "number") return value.toLocaleString("pt-BR");
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  if (Array.isArray(value)) return value.map((v) => String(v)).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
