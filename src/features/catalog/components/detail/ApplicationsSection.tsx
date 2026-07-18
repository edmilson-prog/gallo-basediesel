import { useMemo, useState } from "react";
import type { IApplication, IPart } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { CATALOG_STRINGS } from "../../i18n/pt-BR";
import { ApplicationsEditor } from "../form/ApplicationsEditor";
import type { IPartDraft } from "../../utils/draft";

export interface IApplicationsSectionProps {
  part: IPart;
  editing?: boolean;
  draft?: IPartDraft;
  onDraftChange?: (patch: Partial<IPartDraft>) => void;
}

function groupByBrand(applications: IApplication[]): Map<string, IApplication[]> {
  const map = new Map<string, IApplication[]>();
  for (const app of applications) {
    const list = map.get(app.vehicleBrand) ?? [];
    list.push(app);
    map.set(app.vehicleBrand, list);
  }
  return map;
}

function appMatchesCheck(
  app: IApplication,
  check: { brand?: string; model?: string; year?: number },
): boolean {
  if (check.brand && app.vehicleBrand.toLowerCase() !== check.brand.toLowerCase()) return false;
  if (check.model && app.vehicleModel.toLowerCase() !== check.model.toLowerCase()) return false;
  if (check.year !== undefined) {
    if (check.year < app.yearStart || check.year > app.yearEnd) return false;
  }
  return true;
}

export function ApplicationsSection({
  part,
  editing = false,
  draft,
  onDraftChange,
}: IApplicationsSectionProps) {
  const [check, setCheck] = useState<{ brand: string; model: string; year: string }>({
    brand: "",
    model: "",
    year: "",
  });

  const grouped = useMemo(() => groupByBrand(part.applications), [part.applications]);
  const matchCheck = {
    brand: check.brand || undefined,
    model: check.model || undefined,
    year: check.year ? Number(check.year) : undefined,
  };
  const isCheckActive = Boolean(
    matchCheck.brand || matchCheck.model || matchCheck.year !== undefined,
  );

  if (editing && draft && onDraftChange) {
    return (
      <Section title={CATALOG_STRINGS.detail.sections.applications} icon="mdi:truck-outline">
        <ApplicationsEditor
          applications={draft.applications}
          onChange={(next) => onDraftChange({ applications: next })}
        />
      </Section>
    );
  }

  if (part.applications.length === 0) {
    return (
      <Section title={CATALOG_STRINGS.detail.sections.applications} icon="mdi:truck-outline">
        {part.applicationNotes ? (
          <ApplicationNotes notes={part.applicationNotes} />
        ) : (
          <p className="text-sm text-muted-foreground">
            {CATALOG_STRINGS.detail.applications.empty}
          </p>
        )}
      </Section>
    );
  }

  return (
    <Section title={CATALOG_STRINGS.detail.sections.applications} icon="mdi:truck-outline">
      <div className="mb-4 grid grid-cols-1 gap-2 rounded-md border border-dashed border-border bg-muted/30 p-3 sm:grid-cols-4">
        <div className="sm:col-span-4">
          <Label className="text-xs">{CATALOG_STRINGS.detail.applications.checkLabel}</Label>
        </div>
        <Input
          placeholder="Marca"
          value={check.brand}
          onChange={(e) => setCheck({ ...check, brand: e.target.value })}
          className="h-8 text-xs"
        />
        <Input
          placeholder="Modelo"
          value={check.model}
          onChange={(e) => setCheck({ ...check, model: e.target.value })}
          className="h-8 text-xs"
        />
        <Input
          placeholder="Ano"
          type="number"
          inputMode="numeric"
          value={check.year}
          onChange={(e) => setCheck({ ...check, year: e.target.value })}
          className="h-8 text-xs"
        />
        <button
          type="button"
          onClick={() => setCheck({ brand: "", model: "", year: "" })}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Limpar
        </button>
      </div>

      <div className="space-y-4">
        {Array.from(grouped.entries()).map(([brand, apps]) => (
          <div key={brand}>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {brand}
            </h3>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {apps.map((app) => {
                const matches = isCheckActive && appMatchesCheck(app, matchCheck);
                return (
                  <div
                    key={app.id}
                    className={cn(
                      "rounded-md border border-border bg-card px-3 py-2 text-sm transition-colors",
                      matches && "border-primary/60 bg-primary/5",
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-foreground">{app.vehicleModel}</span>
                      <span className="text-xs text-muted-foreground">
                        {CATALOG_STRINGS.detail.applications.yearsRange(app.yearStart, app.yearEnd)}
                      </span>
                    </div>
                    {app.engine && (
                      <p className="mt-0.5 text-xs text-muted-foreground">Motor: {app.engine}</p>
                    )}
                    {matches && (
                      <p className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-primary">
                        <Icon icon="mdi:check-circle" size={12} /> Compatível
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {part.applicationNotes && <ApplicationNotes notes={part.applicationNotes} />}
    </Section>
  );
}

export function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-b border-border px-4 py-5 last:border-b-0 md:px-8">
      <div className="mb-3 flex items-center gap-2">
        <Icon icon={icon} size={18} className="text-muted-foreground" />
        <h2 className="text-sm font-semibold tracking-tight text-foreground">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function ApplicationNotes({ notes }: { notes: string }) {
  return (
    <div className="mt-4 border-t border-border pt-3">
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {CATALOG_STRINGS.detail.applications.rawLabel}
      </p>
      <p className="whitespace-pre-line text-xs leading-relaxed text-muted-foreground">{notes}</p>
    </div>
  );
}
