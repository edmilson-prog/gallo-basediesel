import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { Icon } from "@/components/Icon";
import { useAccessibleStores } from "@/features/multistore";
import { DashboardLayout } from "@/features/shell/layouts";
import { useNpsProvider } from "@/providers/data";
import { bandsOf, targetOf } from "../engine";
import { useNpsMetrics } from "../hooks/useNpsMetrics";
import { useNpsRecoveries } from "../hooks/useNpsRecoveries";
import { useNpsSettings } from "../hooks/useNpsSettings";
import { S } from "../i18n/pt-BR";
import { NpsSeg } from "../components/NpsKit";
import { NpsTabsBar, parseNpsTab, type INpsTab } from "../components/NpsTabsBar";
import { NpsPainelTab } from "../components/NpsPainelTab";
import { NpsRespostasTab } from "../components/NpsRespostasTab";
import { NpsRecuperacaoTab } from "../components/NpsRecuperacaoTab";
import { NpsEnvioTab } from "../components/NpsEnvioTab";
import { NpsParametrosTab } from "../components/NpsParametrosTab";
import { NpsEmbutidosTab } from "../components/NpsEmbutidosTab";

/**
 * /app/nps — the kit's NPS screen (`ui_kits/nps/index.html`).
 *
 * Six tabs over one window: the filters at the top belong to the screen, not to
 * a tab, so moving from the panel to the answers keeps the same period and the
 * same store rather than silently re-asking a different question.
 *
 * Two rules survive from PRD-148B and are load-bearing: the score never renders
 * without its minimum sample (the hook returns null, so no surface here could
 * cheat), and a month below that minimum breaks the trend rather than drawing
 * a zero.
 *
 * The per-attendant table is a deliberate reversal of the PRD, which excluded
 * it as compare-and-shame. The owner chose the kit's version on 2026-08-12.
 */

const WINDOWS = [
  { days: 1, label: "Hoje" },
  { days: 30, label: S.window30 },
  { days: 90, label: S.window90 },
  { days: 365, label: "12 meses" },
] as const;

const AUDIENCES = [
  { value: undefined, label: S.audienceAll },
  { value: "customer" as const, label: S.audienceCustomer },
  { value: "contact" as const, label: S.audienceContact },
] as const;

/** RFC 4180 quoting — a comment with a comma or a quote must not shift columns. */
function csvCell(value: string | number | null): string {
  const text = value === null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

export function NpsAnalyticsPage() {
  const [tab, setTab] = useState<INpsTab>(() =>
    parseNpsTab(new URLSearchParams(window.location.search).get("aba")),
  );
  const [windowDays, setWindowDays] = useState<number>(30);
  const [audience, setAudience] = useState<"customer" | "contact" | undefined>(undefined);
  const [storeId, setStoreId] = useState<string | undefined>(undefined);
  const [exporting, setExporting] = useState(false);

  const provider = useNpsProvider();
  const stores = useAccessibleStores();
  const settings = useNpsSettings();

  const filters = useMemo(
    () => ({ windowDays, audience, storeId }),
    [windowDays, audience, storeId],
  );
  const metrics = useNpsMetrics(filters, {
    minResponses: settings.data?.minResponsesForScore,
  });
  const recoveries = useNpsRecoveries(filters, settings.data?.recoveryThreshold ?? 6);

  const target = targetOf(settings.data);
  const bands = bandsOf(settings.data);
  const windowLabel = WINDOWS.find((item) => item.days === windowDays)?.label ?? "";

  // Null while the queue is unreadable — before the migration, say — so the tab
  // shows no badge instead of a confident zero.
  const openRecoveries = recoveries.isError
    ? null
    : ((recoveries.data ?? []).filter((item) => item.recoveryStatus !== "resolvido").length ?? 0);

  const goTab = useCallback((next: INpsTab) => {
    setTab(next);
    const url = new URL(window.location.href);
    if (next === "painel") url.searchParams.delete("aba");
    else url.searchParams.set("aba", next);
    window.history.replaceState(null, "", url);
  }, []);

  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      // Asks for the true total first, then that many rows — paging blind would
      // export "the first page" under a filename that claims the window.
      const first = await provider.list({ ...filters, page: 1, pageSize: 1 });
      const all = await provider.list({
        ...filters,
        page: 1,
        pageSize: Math.max(1, Math.min(first.total, 5000)),
      });

      const header = [
        "data",
        "nota",
        "categoria",
        "contato",
        "tipo",
        "loja",
        "atendente",
        "motivos",
        "comentario",
      ];
      const lines = all.data.map((survey) => {
        const score = survey.score ?? 0;
        const category = score >= 9 ? "promotor" : score >= 7 ? "neutro" : "detrator";
        return [
          csvCell(survey.respondedAt),
          csvCell(score),
          csvCell(category),
          csvCell(survey.recipientName),
          csvCell(survey.customerId ? "cliente" : "contato"),
          csvCell(survey.storeName),
          csvCell(survey.sellerName),
          csvCell(survey.reasons.join(" | ")),
          csvCell(survey.comment),
        ].join(",");
      });

      // BOM so Excel in pt-BR opens the accents correctly instead of "avaliaÃ§Ã£o".
      const blob = new Blob(["﻿" + [header.join(","), ...lines].join("\r\n")], {
        type: "text/csv;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `nps-${windowDays}d-${new Date().toISOString().slice(0, 10)}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
      toast.success(`${all.data.length} respostas exportadas.`);
    } catch {
      toast.error("Não foi possível exportar as respostas.");
    } finally {
      setExporting(false);
    }
  }, [provider, filters, windowDays]);

  const storeItems = useMemo(
    () => [
      { value: undefined as string | undefined, label: "Todas as lojas" },
      ...stores.map((store) => ({ value: store.id as string | undefined, label: store.name })),
    ],
    [stores],
  );

  return (
    // DashboardLayout, like every other management screen (Cockpit, Ranking,
    // Comissões, Curva ABC). The kit's own 1320px canvas was its standalone
    // page width, not a rule for this app — reproducing it here narrowed the
    // screen below the shell's 1600px and left gutters on both sides.
    <DashboardLayout>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div>
          <h1 className="font-display text-3xl font-extrabold uppercase leading-[0.96] text-foreground">
            {S.pageTitle}
          </h1>
          <div className="mt-1 text-[13px] text-muted-foreground">
            {windowLabel} · {S.responsesOfSent(metrics.data?.n ?? 0, metrics.data?.sent ?? 0)}
          </div>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <NpsSeg
            ariaLabel="Período"
            items={WINDOWS.map((item) => ({ value: item.days, label: item.label }))}
            value={windowDays}
            onChange={setWindowDays}
          />
          {storeItems.length > 2 ? (
            <NpsSeg ariaLabel="Loja" items={storeItems} value={storeId} onChange={setStoreId} />
          ) : null}
          <NpsSeg
            ariaLabel="Público"
            items={AUDIENCES.map((item) => ({ value: item.value, label: item.label }))}
            value={audience}
            onChange={setAudience}
          />
          <button
            type="button"
            onClick={() => void handleExport()}
            disabled={exporting || (metrics.data?.n ?? 0) === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-[7px] text-[12.5px] font-bold text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
          >
            <Icon icon="lucide:download" size={14} />
            {exporting ? "Exportando…" : "Exportar"}
          </button>
        </div>
      </div>

      <NpsTabsBar tab={tab} onTab={goTab} openRecoveries={openRecoveries ?? 0} />

      {tab !== "painel" ? (
        <div className="mb-4">
          <h2 className="font-display text-3xl font-extrabold uppercase leading-[0.96] text-foreground">
            {tab === "respostas"
              ? "Respostas"
              : tab === "recuperacao"
                ? "Recuperação de detratores"
                : tab === "envio"
                  ? "Envio da pesquisa"
                  : tab === "parametros"
                    ? "Parâmetros do NPS"
                    : "Onde o NPS aparece"}
          </h2>
          <p className="mt-1 max-w-[700px] text-[13px] text-muted-foreground">
            {tab === "respostas"
              ? "Todas as respostas do período com nota, motivos e comentário. Filtra por categoria e por motivo."
              : tab === "recuperacao"
                ? "Nota de 0 a 6 abre tratativa. O prazo de primeiro contato e o desfecho ficam registrados aqui."
                : tab === "envio"
                  ? "Gatilhos, prazo, intervalo entre pesquisas e o texto que o cliente recebe."
                  : tab === "parametros"
                    ? "Meta, faixas, regras da tratativa e onde o NPS aparece para a equipe. O cálculo é fixo — padrão de mercado."
                    : "Os dois pontos em que o NPS entra em telas que já existem no app."}
          </p>
        </div>
      ) : null}

      {tab === "painel" ? (
        <NpsPainelTab
          metrics={metrics.data}
          windowLabel={windowLabel}
          target={target}
          bands={bands}
          openRecoveries={openRecoveries}
          onGoRecoveries={() => goTab("recuperacao")}
        />
      ) : null}

      {tab === "respostas" ? (
        <NpsRespostasTab
          windowDays={windowDays}
          audience={audience}
          counts={{
            total: metrics.data?.n ?? 0,
            promoters: metrics.data?.promoters ?? 0,
            passives: metrics.data?.passives ?? 0,
            detractors: metrics.data?.detractors ?? 0,
          }}
        />
      ) : null}

      {tab === "recuperacao" ? (
        <NpsRecuperacaoTab
          windowDays={windowDays}
          audience={audience}
          slaHours={settings.data?.recoverySlaHours ?? 24}
          threshold={settings.data?.recoveryThreshold ?? 6}
        />
      ) : null}

      {tab === "envio" ? <NpsEnvioTab /> : null}
      {tab === "parametros" ? <NpsParametrosTab /> : null}
      {tab === "embutidos" ? <NpsEmbutidosTab metrics={metrics.data} /> : null}
    </DashboardLayout>
  );
}
