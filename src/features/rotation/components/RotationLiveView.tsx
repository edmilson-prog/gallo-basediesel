import type { IRotationSelectionResult, ISeller } from "@/shared/types";
import { Icon } from "@/components/Icon";

const REASON_LABEL: Record<string, string> = {
  selected: "Próximo",
  skipped_offline: "Offline",
  skipped_disabled: "Desligado",
  skipped_inactive: "Inativo",
  skipped_off_hours: "Fora do horário",
};

interface IRotationLiveViewProps {
  result: IRotationSelectionResult;
  sellersById: Record<string, ISeller>;
  /** Resolves a department refId to a friendly label (department candidates). */
  departmentNameById?: Record<string, string>;
}

/** Live "who's next" view: the next eligible attendant + every evaluated
 *  participant with its state/skip reason (PRD-213 RF-016). */
export function RotationLiveView({
  result,
  sellersById,
  departmentNameById = {},
}: IRotationLiveViewProps) {
  const nextName = result.selectedSellerId
    ? (sellersById[result.selectedSellerId]?.fullName ?? result.selectedSellerId)
    : null;

  function labelFor(refId: string, refType: "seller" | "department"): string {
    if (refType === "department") return departmentNameById[refId] ?? refId;
    return sellersById[refId]?.fullName ?? refId;
  }

  return (
    <section
      className="space-y-3 rounded-md border border-border bg-muted/20 p-4"
      aria-label="Visão ao vivo do rodízio"
    >
      <h2 className="text-sm font-medium text-foreground">Agora</h2>
      <p className="text-sm">
        {nextName ? (
          <>
            Próximo a receber: <span className="font-semibold text-foreground">{nextName}</span>
          </>
        ) : (
          <span className="text-muted-foreground">
            Ninguém elegível agora — conversas seguem para o fallback (SDR/fila).
          </span>
        )}
      </p>
      {result.candidates.length > 0 && (
        <ul className="space-y-1">
          {result.candidates.map((c, i) => (
            <li key={`${c.refId}-${i}`} className="flex items-center justify-between text-xs">
              <span className="text-foreground">{labelFor(c.refId, c.refType)}</span>
              <span
                className={
                  c.selected
                    ? "flex items-center gap-1 text-severity-success"
                    : "text-muted-foreground"
                }
              >
                {c.selected && <Icon icon="mdi:arrow-right-bold" size={14} />}
                {REASON_LABEL[c.reason] ?? c.reason}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
