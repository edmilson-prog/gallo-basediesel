import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Icon } from "@/components/Icon";
import type { ISeller, IScheduleOverride, IWorkScheduleWindow } from "@/shared/types";
import { useSellersProvider, recordAuditLogSync } from "@/providers/data";
import { useAuth } from "@/features/auth/useAuth";
import { validateWorkSchedule } from "../engine/workSchedule";

const WEEKDAY_LABELS = [
  "Domingo",
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
] as const;

/** Default window for a day with no stored schedule. */
const DEFAULT_OPEN = "08:00";
const DEFAULT_CLOSE = "18:00";

interface IWorkScheduleTabProps {
  seller: ISeller;
  storeId: string;
}

/** Builds the 7-row weekly draft, seeding each day from the seller's schedule. */
function buildInitialRows(seller: ISeller): IWorkScheduleWindow[] {
  const stored = seller.workSchedule ?? [];
  return WEEKDAY_LABELS.map((_, weekday) => {
    const existing = stored.find((w) => w.weekday === weekday);
    if (existing) return { ...existing };
    return {
      weekday: weekday as IWorkScheduleWindow["weekday"],
      openAt: DEFAULT_OPEN,
      closeAt: DEFAULT_CLOSE,
      enabled: false,
    };
  });
}

/**
 * "Horário" tab of the user editor (PRD-212, Task 5). Edits the per-user weekly
 * attendance schedule and one-off date exceptions, with its OWN save action —
 * it lives inside the parent "Geral" form, so every button MUST be
 * `type="button"` to avoid triggering that form's submit (which closes the
 * Sheet). Persists via `provider.update`, audits the change and invalidates the
 * relevant query caches.
 */
export function WorkScheduleTab({ seller, storeId }: IWorkScheduleTabProps) {
  const provider = useSellersProvider();
  const { currentUser } = useAuth();
  const queryClient = useQueryClient();

  const [rows, setRows] = useState<IWorkScheduleWindow[]>(() => buildInitialRows(seller));
  const [overrides, setOverrides] = useState<IScheduleOverride[]>(
    () => (seller.scheduleOverrides ?? []).map((o) => ({ ...o })),
  );

  // Validate only the rows that are enabled — disabled days are ignored.
  const errors = useMemo(
    () => validateWorkSchedule(rows.filter((r) => r.enabled)),
    [rows],
  );

  const updateRow = (weekday: number, patch: Partial<IWorkScheduleWindow>) => {
    setRows((prev) => prev.map((row) => (row.weekday === weekday ? { ...row, ...patch } : row)));
  };

  const mutation = useMutation({
    mutationFn: async () => {
      const enabledRows = rows.filter((r) => r.enabled);
      const cleanedOverrides = overrides.filter((o) => o.date.trim() !== "");
      const before = {
        workSchedule: seller.workSchedule ?? [],
        scheduleOverrides: seller.scheduleOverrides ?? [],
      };
      const after = {
        workSchedule: enabledRows,
        scheduleOverrides: cleanedOverrides,
      };
      const saved = await provider.update(seller.id, {
        workSchedule: enabledRows,
        scheduleOverrides: cleanedOverrides,
      });
      recordAuditLogSync({
        storeId,
        actorId: currentUser?.sellerId ?? currentUser?.id ?? "system",
        action: "work_schedule_updated",
        resource: "seller",
        resourceId: seller.id,
        before,
        after,
      });
      return saved;
    },
    onSuccess: async () => {
      toast.success("Horário de atendimento atualizado.");
      await queryClient.invalidateQueries({ queryKey: ["sellers", storeId] });
      await queryClient.invalidateQueries({ queryKey: ["seller"] });
    },
    onError: (err: Error) =>
      toast.error("Não foi possível salvar o horário.", { description: err.message }),
  });

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Define o turno de atendimento do usuário (fuso de Brasília). Fora do turno, papéis
        operacionais não entram na plataforma e ficam offline. Sem nenhum dia ativo, o acesso é
        livre.
      </p>

      <Card>
        <CardContent className="divide-y divide-border p-0">
          {rows.map((row) => (
            <div
              key={row.weekday}
              className="grid grid-cols-[auto_1fr_auto_auto_auto] items-center gap-3 px-4 py-3"
            >
              <Switch
                checked={row.enabled}
                onCheckedChange={(v) => updateRow(row.weekday, { enabled: Boolean(v) })}
                aria-label={`Ativar ${WEEKDAY_LABELS[row.weekday]}`}
              />
              <span
                className={
                  row.enabled
                    ? "text-sm font-medium"
                    : "text-sm text-muted-foreground line-through"
                }
              >
                {WEEKDAY_LABELS[row.weekday]}
              </span>
              <Input
                type="time"
                value={row.openAt}
                onChange={(e) => updateRow(row.weekday, { openAt: e.target.value })}
                disabled={!row.enabled}
                className="h-8 w-28 text-sm"
                aria-label={`Abre em ${WEEKDAY_LABELS[row.weekday]}`}
              />
              <span className="text-xs text-muted-foreground">até</span>
              <Input
                type="time"
                value={row.closeAt}
                onChange={(e) => updateRow(row.weekday, { closeAt: e.target.value })}
                disabled={!row.enabled}
                className="h-8 w-28 text-sm"
                aria-label={`Fecha em ${WEEKDAY_LABELS[row.weekday]}`}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <ScheduleOverridesEditor overrides={overrides} onChange={setOverrides} />

      {errors.length > 0 && (
        <div className="space-y-1 rounded-md border border-severity-warning/30 bg-severity-warning/10 px-3 py-2 text-sm text-severity-warning">
          {errors.map((err, i) => (
            <p key={i} className="flex items-start gap-1.5">
              <Icon icon="mdi:alert-outline" size={14} className="mt-0.5 shrink-0" />
              {err}
            </p>
          ))}
        </div>
      )}

      <div className="flex justify-end">
        <Button
          type="button"
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending || errors.length > 0}
        >
          {mutation.isPending ? "Salvando…" : "Salvar horário"}
        </Button>
      </div>
    </div>
  );
}

interface IScheduleOverridesEditorProps {
  overrides: IScheduleOverride[];
  onChange: (next: IScheduleOverride[]) => void;
}

/**
 * Editor for one-off date exceptions. Each row = a date + a block/allow toggle.
 * `block` closes the whole day; `allow` opens the whole day. Partial windows
 * (openAt/closeAt) are intentionally NOT editable here — kept simple for this
 * first version.
 */
function ScheduleOverridesEditor({ overrides, onChange }: IScheduleOverridesEditorProps) {
  const updateItem = (index: number, patch: Partial<IScheduleOverride>) => {
    onChange(overrides.map((o, i) => (i === index ? { ...o, ...patch } : o)));
  };

  const removeItem = (index: number) => {
    onChange(overrides.filter((_, i) => i !== index));
  };

  const addItem = () => {
    onChange([...overrides, { date: "", type: "block" }]);
  };

  return (
    <section aria-labelledby="schedule-overrides" className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 id="schedule-overrides" className="text-sm font-medium">
          Exceções por data
        </h3>
        <Button type="button" variant="outline" size="sm" onClick={addItem} className="gap-1">
          <Icon icon="mdi:plus" size={14} />
          Adicionar exceção
        </Button>
      </div>
      {overrides.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Nenhuma exceção. Use para fechar (feriado/folga) ou liberar um dia específico.
        </p>
      ) : (
        <div className="space-y-2">
          {overrides.map((item, index) => (
            <div key={index} className="flex items-center gap-2">
              <Input
                type="date"
                value={item.date}
                onChange={(e) => updateItem(index, { date: e.target.value })}
                className="h-8 w-40 text-sm"
                aria-label={`Data da exceção ${index + 1}`}
              />
              <Select
                value={item.type}
                onValueChange={(value) =>
                  updateItem(index, { type: value as IScheduleOverride["type"] })
                }
              >
                <SelectTrigger
                  className="h-8 w-32 text-sm"
                  aria-label={`Tipo da exceção ${index + 1}`}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="block">Fechar dia</SelectItem>
                  <SelectItem value="allow">Liberar dia</SelectItem>
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => removeItem(index)}
                className="h-8 w-8 shrink-0 text-muted-foreground hover:text-severity-critical"
                aria-label={`Remover exceção ${index + 1}`}
              >
                <Icon icon="mdi:trash-can-outline" size={16} />
              </Button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
