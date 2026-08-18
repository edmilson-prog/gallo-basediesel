import { useNavigate } from "@tanstack/react-router";
import { Icon } from "@/components/Icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AnalysisCard } from "../components/analysis/AnalysisCard";
import { PriceSeries } from "../components/analysis/PriceSeries";
import { useFiscalAnalysis } from "../hooks/useFiscalAnalysis";
import { FISCAL_NOTES_STRINGS } from "../i18n/pt-BR";

export function FiscalAnalysisPage() {
  const { cards, rules, hasNotes, isLoading } = useFiscalAnalysis();
  const navigate = useNavigate();
  const s = FISCAL_NOTES_STRINGS.analysis;

  return (
    <div className="flex h-full flex-col">
      <header className="flex shrink-0 flex-col gap-1 border-b border-border/40 bg-background/85 px-4 py-3 shadow-lg shadow-foreground/5 backdrop-blur-2xl backdrop-saturate-[1.8] supports-[backdrop-filter]:bg-background/50 md:px-6">
        <div className="flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-md bg-primary/10 text-primary">
            <Icon icon="mdi:auto-fix" size={20} aria-hidden />
          </div>
          <h1 className="font-display text-xl font-extrabold uppercase leading-none tracking-[0.01em] text-foreground">
            {s.title}
          </h1>
        </div>
        <p className="max-w-3xl text-[12.5px] text-muted-foreground">{s.subtitle}</p>
      </header>

      <div className="min-h-0 flex-1 overflow-auto px-4 py-4 md:px-6">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <section>
            {isLoading ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div
                    key={index}
                    className="h-36 animate-pulse rounded-xl bg-muted motion-reduce:animate-none"
                  />
                ))}
              </div>
            ) : cards.length === 0 ? (
              <div className="grid place-items-center gap-3 rounded-xl border border-border bg-card p-10 text-center">
                <Icon icon="mdi:auto-fix" size={28} className="text-muted-foreground" aria-hidden />
                <p className="font-display text-lg font-extrabold uppercase text-foreground">
                  {s.emptyTitle}
                </p>
                <p className="max-w-sm text-sm text-muted-foreground">{s.emptyDescription}</p>
                {!hasNotes && (
                  <Button
                    size="sm"
                    onClick={() => void navigate({ to: "/app/suprimentos/importar" })}
                  >
                    {s.goImport}
                  </Button>
                )}
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {cards.map((card, index) => (
                  <AnalysisCard key={`${card.kind}-${index}`} card={card}>
                    {card.series && card.series.length > 1 && <PriceSeries points={card.series} />}
                  </AnalysisCard>
                ))}
              </div>
            )}
          </section>

          <aside className="flex flex-col gap-3">
            <div className="rounded-xl border border-border bg-card p-4">
              <h2 className="text-sm font-bold text-foreground">{s.howTitle}</h2>

              <h3 className="mt-3 font-semicond text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                {s.readsTitle}
              </h3>
              {s.reads.map((line) => (
                <p key={line} className="mt-1.5 flex gap-2 text-[12px] text-muted-foreground">
                  <Icon
                    icon="mdi:check"
                    size={13}
                    className="mt-0.5 shrink-0 text-severity-success"
                    aria-hidden
                  />
                  {line}
                </p>
              ))}

              {/* RS-04: a fronteira da IA é parte do produto, não rodapé. */}
              <h3 className="mt-4 font-semicond text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                {s.neverTitle}
              </h3>
              {s.never.map((line) => (
                <p key={line} className="mt-1.5 flex gap-2 text-[12px] text-muted-foreground">
                  <Icon
                    icon="mdi:close"
                    size={13}
                    className="mt-0.5 shrink-0 text-severity-critical"
                    aria-hidden
                  />
                  {line}
                </p>
              ))}
            </div>

            <div className="rounded-xl border border-border bg-card p-4">
              <h2 className="text-sm font-bold text-foreground">{s.rulesTitle}</h2>
              <p className="text-[11px] text-muted-foreground">{s.rulesHint}</p>
              {rules.length === 0 ? (
                <p className="mt-2 text-[12px] text-muted-foreground">{s.rulesEmpty}</p>
              ) : (
                rules.map((rule) => (
                  <div
                    key={`${rule.supplierName}-${rule.description}`}
                    className="flex gap-2 border-b border-border py-2 last:border-b-0"
                  >
                    <Icon
                      icon="mdi:division"
                      size={14}
                      className="mt-0.5 shrink-0 text-muted-foreground"
                      aria-hidden
                    />
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 text-[12px] font-bold text-foreground">
                        {rule.supplierName}
                        {rule.isNew && (
                          <Badge variant="outline" className="border-primary/40 text-primary">
                            nova
                          </Badge>
                        )}
                      </p>
                      <p className="truncate text-[11.5px] text-muted-foreground">
                        {rule.description}
                      </p>
                      <p className="text-[10.5px] text-muted-foreground">
                        {s.ruleApplied(rule.appliedCount)}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
