import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/shared/utils/format";
import { GOALS_STRINGS as S } from "../i18n/pt-BR";
import { MONTH_LABELS } from "../utils/batchGoals";
import type { IUseBatchGoalsResult } from "../hooks/useBatchGoals";

function parseBRL(input: string): number | null {
  const digits = String(input).replace(/[^\d]/g, "");
  if (digits === "") return null;
  return Number(digits) / 100;
}

export interface IBatchGoalsTableProps {
  ctl: IUseBatchGoalsResult;
  monthIdx: number;
}

export function BatchGoalsTable({ ctl, monthIdx }: IBatchGoalsTableProps) {
  const monthLabel = MONTH_LABELS[monthIdx] ?? "";
  const allChecked = ctl.sellers.every((s) => ctl.isChecked(s.id));

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
            <th className="w-9 p-2.5 text-left">
              <input
                type="checkbox"
                checked={allChecked}
                onChange={(e) => ctl.setAllChecked(e.target.checked)}
                className="size-4 accent-primary"
              />
            </th>
            <th className="p-2.5 text-left font-semibold">{S.batchColSeller}</th>
            <th className="p-2.5 text-right font-semibold">{S.batchColMonthTarget(monthLabel)}</th>
            <th className="w-28 p-2.5 text-right font-semibold">{S.batchColSuggestion}</th>
            <th className="w-36 p-2.5 text-right font-semibold">{S.batchColAnnualTotal}</th>
            <th className="w-44 p-2.5 text-left font-semibold">{S.batchColStatus}</th>
          </tr>
        </thead>
        <tbody>
          {ctl.sellers.map((s) => {
            const conflict = ctl.hasConflict(s.id, monthIdx);
            const value = ctl.getValue(s.id, monthIdx);
            const initials = s.name
              .split(" ")
              .map((p) => p[0] ?? "")
              .slice(0, 2)
              .join("")
              .toUpperCase();
            return (
              <tr key={s.id} className={cn("border-b border-border", conflict && "opacity-55")}>
                <td className="p-2.5">
                  <input
                    type="checkbox"
                    checked={ctl.isChecked(s.id)}
                    disabled={conflict}
                    onChange={(e) => ctl.setChecked(s.id, e.target.checked)}
                    className="size-4 accent-primary"
                  />
                </td>
                <td className="p-2.5">
                  <div className="flex items-center gap-2.5">
                    <span className="flex size-7 items-center justify-center rounded-full bg-muted text-[11px] font-bold text-muted-foreground">
                      {initials}
                    </span>
                    {s.name}
                  </div>
                </td>
                <td className="p-2.5 text-right">
                  <input
                    className="w-32 rounded-md border border-border bg-background px-2 py-1.5 text-right tabular-nums disabled:opacity-50"
                    placeholder="—"
                    disabled={conflict}
                    defaultValue={value != null ? formatBRL(value) : ""}
                    onBlur={(e) => ctl.setValue(s.id, monthIdx, parseBRL(e.target.value))}
                  />
                </td>
                <td className="p-2.5 text-right">
                  <button
                    type="button"
                    disabled={conflict}
                    onClick={() => ctl.setValue(s.id, monthIdx, ctl.suggestionFor(s.id))}
                    className="text-xs text-sky-500 tabular-nums hover:underline disabled:opacity-50"
                  >
                    {formatBRL(ctl.suggestionFor(s.id))}
                  </button>
                </td>
                <td className="p-2.5 text-right">
                  <span className="font-semibold tabular-nums text-foreground">
                    {formatBRL(ctl.annualTotal(s.id))}
                  </span>
                  <span className="block text-[11px] text-muted-foreground">
                    {S.batchAnnualMonths(ctl.filledMonths(s.id))}
                  </span>
                </td>
                <td className="p-2.5">
                  {conflict ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-severity-warning/15 px-2 py-1 text-[11px] font-semibold text-severity-warning">
                      <Icon icon="mdi:alert-outline" size={12} />
                      {S.batchRowConflict(monthLabel)}
                    </span>
                  ) : value != null ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-2 py-1 text-[11px] font-semibold text-primary">
                      <Icon icon="mdi:check" size={12} />
                      {S.batchRowWillCreate}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">{S.batchRowEmpty}</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
