import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CATALOG_STRINGS } from "../../i18n/pt-BR";
import type { IApplicationDraft } from "../../utils/applicationDrafts";

export interface IApplicationsEditorProps {
  applications: IApplicationDraft[];
  onChange: (next: IApplicationDraft[]) => void;
}

const makeDraftId = () => `draft-${Math.random().toString(36).slice(2, 8)}`;

export function ApplicationsEditor({ applications, onChange }: IApplicationsEditorProps) {
  const updateRow = (index: number, patch: Partial<IApplicationDraft>) => {
    const current = applications[index];
    if (!current) return;
    const next = applications.slice();
    next[index] = { ...current, ...patch };
    onChange(next);
  };

  const addRow = () => {
    onChange([
      ...applications,
      {
        draftId: makeDraftId(),
        vehicleBrand: "",
        vehicleModel: "",
        yearStart: new Date().getFullYear() - 5,
        yearEnd: new Date().getFullYear(),
        engine: undefined,
      },
    ]);
  };

  const removeRow = (draftId: string) => {
    onChange(applications.filter((a) => a.draftId !== draftId));
  };

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        {CATALOG_STRINGS.form.fields.applicationsHint}
      </p>

      {applications.length === 0 && (
        <p className="rounded-md border border-dashed border-severity-warning/40 bg-severity-warning/10 px-3 py-2 text-xs text-severity-warning">
          {CATALOG_STRINGS.form.noApplicationsWarning}
        </p>
      )}

      <div className="space-y-2">
        {applications.map((app, index) => (
          <div
            key={app.draftId}
            className="grid grid-cols-1 gap-2 rounded-md border border-border bg-card p-3 sm:grid-cols-[1.2fr_1.2fr_0.7fr_0.7fr_1fr_auto]"
          >
            <div>
              <Label className="text-[10px] uppercase">Marca</Label>
              <Input
                value={app.vehicleBrand}
                onChange={(e) => updateRow(index, { vehicleBrand: e.target.value })}
                className="h-8"
              />
            </div>
            <div>
              <Label className="text-[10px] uppercase">Modelo</Label>
              <Input
                value={app.vehicleModel}
                onChange={(e) => updateRow(index, { vehicleModel: e.target.value })}
                className="h-8"
              />
            </div>
            <div>
              <Label className="text-[10px] uppercase">Ano inicial</Label>
              <Input
                type="number"
                value={app.yearStart}
                onChange={(e) => updateRow(index, { yearStart: Number(e.target.value) })}
                className="h-8"
              />
            </div>
            <div>
              <Label className="text-[10px] uppercase">Ano final</Label>
              <Input
                type="number"
                value={app.yearEnd}
                onChange={(e) => updateRow(index, { yearEnd: Number(e.target.value) })}
                className="h-8"
              />
            </div>
            <div>
              <Label className="text-[10px] uppercase">Motor (opcional)</Label>
              <Input
                value={app.engine ?? ""}
                onChange={(e) =>
                  updateRow(index, { engine: e.target.value === "" ? undefined : e.target.value })
                }
                className="h-8"
              />
            </div>
            <div className="flex items-end">
              <button
                type="button"
                onClick={() => removeRow(app.draftId)}
                className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                aria-label="Remover aplicação"
              >
                <Icon icon="mdi:close" size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>

      <Button type="button" variant="outline" size="sm" onClick={addRow}>
        <Icon icon="mdi:plus" size={14} />
        {CATALOG_STRINGS.form.addApplication}
      </Button>
    </div>
  );
}
