import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { useDataHealth } from "@/features/shell/hooks/useDataHealth";
import type { DataSource } from "@/providers/data";

/** Human label for each data origin (no technical jargon for end users). */
const SOURCE_LABEL: Record<DataSource, string> = {
  supabase: "Supabase",
  mock: "dados de demonstração",
};

/** Natural pt-BR enumeration: "A", "A e B", "A, B e C". */
function joinLabels(labels: string[]): string {
  if (labels.length <= 1) return labels[0] ?? "";
  if (labels.length === 2) return `${labels[0]} e ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")} e ${labels[labels.length - 1]}`;
}

/**
 * App-wide banner that makes a data-origin break impossible to miss — and, just
 * as important, names *what* failed. It tells apart two situations:
 *
 *  - **genuine load failure** (network, RLS, bug) → critical red banner listing
 *    the affected domains, with a retry;
 *  - **known Fase 2 gap** (a domain not yet implemented for the active source,
 *    e.g. notifications on Supabase) → softer amber notice, so the user isn't
 *    told to "check the connection" for a feature that simply doesn't exist yet.
 *
 * It only appears when a screen the user is viewing depends on the failing data,
 * and hides itself the moment data recovers.
 */
export function DataSourceBanner() {
  const { failures, source, retry } = useDataHealth();

  if (failures.length === 0) return null;

  const errors = failures.filter((f) => f.kind === "error");
  const gaps = failures.filter((f) => f.kind === "unimplemented");

  // A genuine load failure outranks a known not-yet-implemented gap.
  const critical = errors.length > 0;
  const tone = critical ? "critical" : "warning";

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={
        critical
          ? "flex items-center gap-3 border-b border-severity-critical/30 bg-severity-critical/15 px-4 py-2 text-sm text-severity-critical"
          : "flex items-center gap-3 border-b border-severity-warning/30 bg-severity-warning/15 px-4 py-2 text-sm text-severity-warning"
      }
      data-tone={tone}
    >
      <Icon
        icon={critical ? "mdi:cloud-alert-outline" : "mdi:cloud-clock-outline"}
        size={18}
        className="shrink-0"
      />
      <p className="min-w-0 flex-1">
        {critical ? (
          <>
            <span className="font-semibold">
              Não foi possível carregar: {joinLabels(errors.map((f) => f.label))}
            </span>
            <span className="opacity-80">
              {" "}
              (origem: {SOURCE_LABEL[source]}). Verifique a conexão e tente novamente.
            </span>
            {gaps.length > 0 && (
              <span className="opacity-70">
                {" "}
                Ainda não disponível no {SOURCE_LABEL[source]}:{" "}
                {joinLabels(gaps.map((f) => f.label))}.
              </span>
            )}
          </>
        ) : (
          <>
            <span className="font-semibold">
              Ainda não disponível no {SOURCE_LABEL[source]}: {joinLabels(gaps.map((f) => f.label))}
            </span>
            <span className="opacity-80"> (recurso em implementação).</span>
          </>
        )}
      </p>
      <Button
        size="sm"
        variant="outline"
        onClick={retry}
        className={
          critical
            ? "shrink-0 border-severity-critical/40 text-severity-critical hover:bg-severity-critical/10 hover:text-severity-critical"
            : "shrink-0 border-severity-warning/40 text-severity-warning hover:bg-severity-warning/10 hover:text-severity-warning"
        }
      >
        Tentar novamente
      </Button>
    </div>
  );
}
