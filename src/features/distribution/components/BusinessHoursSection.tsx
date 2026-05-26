import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { IBusinessHoursWindow, IDistributionSettings } from "@/shared/types";

interface IBusinessHoursSectionProps {
  settings: IDistributionSettings;
  saving: boolean;
  onChange: (patch: Partial<IDistributionSettings>) => Promise<void>;
}

const WEEKDAY_LABELS: Record<number, string> = {
  0: "Domingo",
  1: "Segunda",
  2: "Terça",
  3: "Quarta",
  4: "Quinta",
  5: "Sexta",
  6: "Sábado",
};

export function BusinessHoursSection({ settings, saving, onChange }: IBusinessHoursSectionProps) {
  const [draft, setDraft] = useState<IBusinessHoursWindow[]>(settings.businessHours);

  const dirty = useMemo(() => {
    if (draft.length !== settings.businessHours.length) return true;
    for (let i = 0; i < draft.length; i += 1) {
      const a = draft[i];
      const b = settings.businessHours[i];
      if (
        a.enabled !== b.enabled ||
        a.openAt !== b.openAt ||
        a.closeAt !== b.closeAt ||
        a.weekday !== b.weekday
      )
        return true;
    }
    return false;
  }, [draft, settings.businessHours]);

  const updateRow = (index: number, patch: Partial<IBusinessHoursWindow>) => {
    setDraft((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const save = async () => {
    try {
      await onChange({ businessHours: draft });
      toast.success("Horário comercial atualizado.");
    } catch {
      toast.error("Não foi possível salvar o horário.");
    }
  };

  const reset = () => setDraft(settings.businessHours);

  return (
    <section aria-labelledby="business-hours" className="space-y-3">
      <header className="flex items-baseline justify-between gap-2">
        <div>
          <h2 id="business-hours" className="text-base font-semibold">
            Horário comercial
          </h2>
          <p className="text-sm text-muted-foreground">
            Fora destas janelas o SDR assume com a mensagem de boas-vindas configurada abaixo.
          </p>
        </div>
        {dirty && (
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={reset} disabled={saving}>
              Descartar
            </Button>
            <Button size="sm" onClick={() => void save()} disabled={saving}>
              Salvar horário
            </Button>
          </div>
        )}
      </header>
      <Card>
        <CardContent className="divide-y divide-border p-0">
          {draft.map((row, i) => (
            <div
              key={`${row.weekday}-${i}`}
              className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-3 px-4 py-3 sm:grid-cols-[auto_140px_auto_auto_auto_auto]"
            >
              <Switch
                checked={row.enabled}
                onCheckedChange={(v) => updateRow(i, { enabled: Boolean(v) })}
                aria-label={`Ativar ${WEEKDAY_LABELS[row.weekday]}`}
              />
              <span
                className={
                  row.enabled ? "text-sm font-medium" : "text-sm text-muted-foreground line-through"
                }
              >
                {WEEKDAY_LABELS[row.weekday]}
              </span>
              <Input
                type="time"
                value={row.openAt}
                onChange={(e) => updateRow(i, { openAt: e.target.value })}
                disabled={!row.enabled}
                className="h-8 w-28 text-sm"
                aria-label={`Abre em ${WEEKDAY_LABELS[row.weekday]}`}
              />
              <span className="text-xs text-muted-foreground">até</span>
              <Input
                type="time"
                value={row.closeAt}
                onChange={(e) => updateRow(i, { closeAt: e.target.value })}
                disabled={!row.enabled}
                className="h-8 w-28 text-sm"
                aria-label={`Fecha em ${WEEKDAY_LABELS[row.weekday]}`}
              />
            </div>
          ))}
        </CardContent>
      </Card>
    </section>
  );
}
