import { useMemo, useState } from "react";
import type { IApplication, IPart } from "@/shared/types";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Icon } from "@/components/Icon";
import { STOREFRONT_PRODUCT_STRINGS as S } from "../i18n/pt-BR";

export interface IApplicationsTabProps {
  part: IPart;
}

interface ICompatCheck {
  brand: string | null;
  model: string | null;
  year: number | null;
}

/**
 * Applications tab — lists `IApplication[]` grouped by vehicle brand and
 * surfaces an inline "Verificar compatibilidade" filter that highlights the
 * matching row with a ✓ Compatível badge (PRD-063 RF-013).
 */
export function ApplicationsTab({ part }: IApplicationsTabProps) {
  const [draft, setDraft] = useState<ICompatCheck>({ brand: null, model: null, year: null });
  const [applied, setApplied] = useState<ICompatCheck | null>(null);

  const applications = part.applications;

  const grouped = useMemo(() => {
    const map = new Map<string, IApplication[]>();
    for (const app of applications) {
      const bucket = map.get(app.vehicleBrand) ?? [];
      bucket.push(app);
      map.set(app.vehicleBrand, bucket);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [applications]);

  const brandOptions = useMemo(() => {
    return [...new Set(applications.map((a) => a.vehicleBrand))].sort();
  }, [applications]);

  const modelOptions = useMemo(() => {
    if (!draft.brand) return [];
    return [
      ...new Set(
        applications.filter((a) => a.vehicleBrand === draft.brand).map((a) => a.vehicleModel),
      ),
    ].sort();
  }, [applications, draft.brand]);

  const yearOptions = useMemo(() => {
    if (!draft.brand || !draft.model) return [];
    const subset = applications.filter(
      (a) => a.vehicleBrand === draft.brand && a.vehicleModel === draft.model,
    );
    const years = new Set<number>();
    for (const app of subset) {
      for (let y = app.yearStart; y <= app.yearEnd; y += 1) years.add(y);
    }
    return [...years].sort((a, b) => b - a);
  }, [applications, draft.brand, draft.model]);

  const matchesCompat = (app: IApplication): boolean => {
    if (!applied) return false;
    if (applied.brand && applied.brand !== app.vehicleBrand) return false;
    if (applied.model && applied.model !== app.vehicleModel) return false;
    if (applied.year !== null && (applied.year < app.yearStart || applied.year > app.yearEnd)) {
      return false;
    }
    return true;
  };

  const hasAnyMatch = applied ? applications.some(matchesCompat) : false;

  if (applications.length === 0) {
    return (
      <Card className="border-dashed border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
        <Icon
          icon="mdi:truck-outline"
          size={28}
          className="mx-auto mb-2 text-muted-foreground"
          aria-hidden
        />
        {S.appEmpty}
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-3 border-primary/20 bg-primary/5 p-4">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Icon icon="mdi:truck-check" size={16} className="text-primary" aria-hidden />
            {S.appCheckTitle}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">{S.appCheckSubtitle}</p>
        </div>

        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_8rem_auto]">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              {S.appBrandLabel}
            </label>
            <Select
              value={draft.brand ?? ""}
              onValueChange={(v) => setDraft({ brand: v || null, model: null, year: null })}
            >
              <SelectTrigger className="bg-background">
                <SelectValue placeholder={S.appBrandPlaceholder} />
              </SelectTrigger>
              <SelectContent>
                {brandOptions.map((b) => (
                  <SelectItem key={b} value={b}>
                    {b}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              {S.appModelLabel}
            </label>
            <Select
              value={draft.model ?? ""}
              disabled={!draft.brand}
              onValueChange={(v) => setDraft((d) => ({ ...d, model: v || null, year: null }))}
            >
              <SelectTrigger className="bg-background">
                <SelectValue placeholder={S.appModelPlaceholder} />
              </SelectTrigger>
              <SelectContent>
                {modelOptions.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              {S.appYearLabel}
            </label>
            <Select
              value={draft.year !== null ? String(draft.year) : ""}
              disabled={!draft.model}
              onValueChange={(v) => setDraft((d) => ({ ...d, year: v ? Number(v) : null }))}
            >
              <SelectTrigger className="bg-background">
                <SelectValue placeholder={S.appYearPlaceholder} />
              </SelectTrigger>
              <SelectContent>
                {yearOptions.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end gap-2">
            <Button
              variant="default"
              size="sm"
              disabled={!draft.brand}
              onClick={() => setApplied(draft)}
            >
              {S.appCheckCta}
            </Button>
            {applied && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setApplied(null);
                  setDraft({ brand: null, model: null, year: null });
                }}
              >
                {S.appCheckClear}
              </Button>
            )}
          </div>
        </div>

        {applied && !hasAnyMatch && (
          <p className="rounded-sm border border-severity-warning/30 bg-severity-warning/10 p-2 text-xs text-severity-warning">
            {S.appNoMatchHint}
          </p>
        )}
      </Card>

      <div className="space-y-3">
        {grouped.map(([brand, apps]) => (
          <Card key={brand} className="space-y-2 p-4">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {brand}
            </h4>
            <ul className="space-y-1.5">
              {apps.map((app) => {
                const compatible = matchesCompat(app);
                return (
                  <li
                    key={app.id}
                    className={`flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm ${
                      compatible ? "border-primary/50 bg-primary/10" : "border-border bg-background"
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="font-medium text-foreground">{app.vehicleModel}</span>
                      <span className="text-xs text-muted-foreground">
                        {S.appYearRange(app.yearStart, app.yearEnd)}
                      </span>
                      {app.engine && (
                        <span className="text-xs text-muted-foreground">
                          {S.appEngineLabel}: <span className="font-mono">{app.engine}</span>
                        </span>
                      )}
                    </div>
                    {compatible && (
                      <Badge className="border-primary/40 bg-primary/15 text-primary">
                        {S.appCompatibleBadge}
                      </Badge>
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>
        ))}
      </div>
    </div>
  );
}
