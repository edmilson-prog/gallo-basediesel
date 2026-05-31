import type { ReactNode } from "react";

/**
 * Cockpit: header row · hero · KPI strip · grid[ main (2/3) | sticky rail (1/3) ].
 * Wide container (max 1600px). On < lg the rail stacks under main.
 */
export function CockpitShell({
  header,
  hero,
  kpis,
  main,
  rail,
}: {
  header: ReactNode;
  hero: ReactNode;
  kpis: ReactNode;
  main: ReactNode;
  rail: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-4 p-4 md:p-6">
      {header}
      {hero}
      {kpis}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">{main}</div>
        <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">{rail}</aside>
      </div>
    </div>
  );
}

/**
 * Operacional: header · hero · [stepper + action zone] · responsive grid of
 * operational cards · main (items + history).
 */
export function OperationalShell({
  header,
  hero,
  stepper,
  actions,
  grid,
  main,
}: {
  header: ReactNode;
  hero: ReactNode;
  stepper: ReactNode;
  actions: ReactNode;
  grid: ReactNode;
  main: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-4 p-4 md:p-6">
      {header}
      {hero}
      <div className="space-y-4 rounded-lg border border-border bg-card p-4">
        {stepper}
        {actions}
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{grid}</div>
      <div className="space-y-4">{main}</div>
    </div>
  );
}

/**
 * Documento: header (back + switcher, not "printed") · centered document
 * (header · parties · items · totals right · footer).
 */
export function DocumentShell({
  header,
  docHeader,
  parties,
  items,
  totals,
  footer,
}: {
  header: ReactNode;
  docHeader: ReactNode;
  parties: ReactNode;
  items: ReactNode;
  totals: ReactNode;
  footer: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 p-4 md:p-8">
      {header}
      <div className="space-y-6 rounded-lg border border-border bg-card p-6 md:p-8">
        {docHeader}
        {parties}
        {items}
        <div className="flex justify-end">{totals}</div>
        {footer}
      </div>
    </div>
  );
}
