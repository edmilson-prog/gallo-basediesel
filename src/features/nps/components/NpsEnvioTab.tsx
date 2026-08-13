import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useCurrentStore } from "@/features/multistore";
import { useNpsProvider } from "@/providers/data";
import type { INpsSettings } from "@/shared/types";
import { useNpsMetrics } from "../hooks/useNpsMetrics";
import { NpsStack } from "./NpsPanelParts";

/**
 * "Envio" tab of /app/nps — direction A · Denso, from `ui_kits/nps` (`NpsEnvio`).
 *
 * This tab is **read-only on purpose**. The kit draws it as a second form, but
 * the real configuration already has one owner-facing screen
 * (`pages/NpsSettingsPage.tsx`, /app/configuracoes/nps) writing a single row in
 * `nps_settings`. A second editor over the same row would be two truths for one
 * value, so what the kit renders as inputs is rendered here as a summary that
 * says what is in force and links to the screen that changes it.
 *
 * Three other places where the kit and this platform disagree, resolved toward
 * the platform:
 *
 * - **Triggers.** The kit lists four (OS fechada, pedido entregue, orçamento
 *   recusado, visita técnica). Only two are modelled here — `conversation_resolved`,
 *   the only one with volume, and `order_delivered`, which is dormant because
 *   `orders` is empty in production. The other two do not exist and are named
 *   as absent rather than drawn as switches that control nothing.
 * - **Reenvio único.** The kit offers a single retry; the scheduler implements
 *   none. Stated as a fact in "Exceções" instead of shown as a knob.
 * - **Palette.** The kit hard-codes hex; every colour here is a semantic token,
 *   as in `NpsPanelParts.tsx`.
 */

/** UI copy, pt-BR. Kept local: this tab's strings are not shared with the panel. */
const T = {
  statusOnTitle: "Pesquisa ativa",
  statusOnBody: "O agendador roda de hora em hora e envia pela própria thread do WhatsApp.",
  statusOffTitle: "Pesquisa desligada",
  statusOffBody: "Nenhuma pesquisa é criada nem enviada enquanto a chave estiver desligada.",
  statusUnsetTitle: "Sem configuração para esta loja",
  statusUnsetBody:
    "Esta loja nunca teve os parâmetros do NPS salvos, então nada é enviado. A configuração nasce no primeiro salvamento.",
  openSettings: "Abrir Configurações → NPS",

  triggersTitle: "Gatilhos",
  triggersSub: "o que faz uma pesquisa nascer",
  triggersAbsent:
    "Ordem de serviço fechada, orçamento recusado e visita técnica não existem como gatilho nesta plataforma — não há evento correspondente para escutar.",

  paramsTitle: "Parâmetros em vigor",
  paramsSub: "somente leitura",
  paramsUnset: "Os parâmetros aparecem aqui depois do primeiro salvamento em Configurações → NPS.",
  paramsUtcNote:
    "As horas da janela de envio são comparadas em UTC. Frederico Westphalen é UTC−3, então 9h locais correspondem a 12 aqui.",

  previewTitle: "Prévia da mensagem",
  previewSub: "texto real do agendador",
  previewNote:
    "É o texto exato de nps-scheduler/message.ts. Vai como mensagem comum na thread que a conversa já ocupa — o motor de produção é o WAHA, que não tem janela de 24h nem template HSM aprovado.",
  previewTokenNote: (days: number | null) =>
    days === null
      ? "O link carrega um token de 64 caracteres, único por pesquisa."
      : `O link carrega um token de 64 caracteres, único por pesquisa, válido por ${days} ${days === 1 ? "dia" : "dias"}.`,

  exceptionsTitle: "Exceções",
  exceptionsSub: "quando a pesquisa não sai",
  exceptionsNoResend:
    "Não há reenvio. Uma pesquisa por atendimento: se o cliente não responder, o link simplesmente expira.",

  funnelTitle: "Funil dos últimos 30 dias",
  funnelSub: "envio → resposta",
  funnelEmpty: "Sem envios no período.",
  funnelLoading: "Carregando…",
  funnelSent: "Enviadas",
  funnelAnswered: "Respondidas",
  funnelSilent: "Sem resposta",
  funnelSentSub: "pesquisas que chegaram ao destinatário",
  funnelAnsweredSub: (rate: number) => `${rate}% de taxa de resposta`,
  funnelSilentSub: "enviadas que ainda não voltaram",
  funnelDistribution: "Distribuição das respostas",

  noStore: "Selecione uma loja para ver a configuração de envio.",
  loading: "Carregando…",
} as const;

/**
 * Mirrors `buildSurveyMessage` in `supabase/functions/nps-scheduler/message.ts`.
 *
 * Duplicated rather than imported: that module targets Deno and is not part of
 * the SPA bundle. Keep the two in sync — this preview is what the owner reads
 * before flipping the switch, so any drift here is a promise the sender breaks.
 */
function buildPreviewMessage(firstName: string, surveyUrl: string): string {
  const trimmed = firstName.trim();
  const greeting = trimmed.length > 0 ? `Oi, ${trimmed}!` : "Oi!";
  return (
    `${greeting} Aqui é da GALLO Base Diesel. Seu atendimento foi concluído — ` +
    `de 0 a 10, qual a chance de você nos recomendar para um colega? ` +
    `É rapidinho: ${surveyUrl}`
  );
}

/** Same default as `nps-scheduler/index.ts` (`DEFAULT_PUBLIC_BASE_URL`). */
const PUBLIC_BASE_URL = "https://crm.gallobasediesel.com.br";

/** Illustrative only — a real token is 64 characters and never shown in the UI. */
const SAMPLE_TOKEN = "a1b2c3d4…";
const SAMPLE_FIRST_NAME = "Marcos";

/**
 * Full class names, never interpolated: Tailwind scans source text, so a class
 * assembled at runtime (`text-${tone}`) is never generated and the colour
 * silently disappears in the production build.
 */
const CHIP_TONE = {
  active: "border-severity-success/30 bg-severity-success/15 text-severity-success",
  dormant: "border-severity-warning/30 bg-severity-warning/15 text-severity-warning",
  off: "border-border bg-muted text-muted-foreground",
} as const;

type IChipTone = keyof typeof CHIP_TONE;

function Chip({ tone, children }: { tone: IChipTone; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 font-display text-[10.5px] font-bold uppercase tracking-[0.08em] ${CHIP_TONE[tone]}`}
    >
      {children}
    </span>
  );
}

/** The kit's `NpsCard`, matching the panel's card in `NpsAnalyticsPage`. */
function Card({
  title,
  sub,
  children,
  className = "",
}: {
  title: string;
  sub?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`overflow-hidden rounded-xl border border-border bg-card ${className}`}>
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <span className="text-[13px] font-bold text-card-foreground">{title}</span>
        {sub ? <span className="text-xs text-muted-foreground">{sub}</span> : null}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

interface ITriggerCardProps {
  label: string;
  code: string;
  tone: IChipTone;
  status: string;
  detail: string;
}

function TriggerCard({ label, code, tone, status, detail }: ITriggerCardProps) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3">
      <div className="flex items-center gap-2">
        <span className="text-[13px] font-bold text-card-foreground">{label}</span>
        <span className="ml-auto">
          <Chip tone={tone}>{status}</Chip>
        </span>
      </div>
      <code className="mt-1 block text-[11px] text-muted-foreground/70">{code}</code>
      <p className="mt-2 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function ParamItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/40 px-3 py-2.5">
      <div className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 font-display text-[17px] font-bold text-card-foreground">{value}</div>
    </div>
  );
}

function FunnelStage({
  label,
  value,
  sub,
  valueClass = "text-card-foreground",
}: {
  label: string;
  value: number;
  sub: string;
  valueClass?: string;
}) {
  return (
    <div className="rounded-lg border border-border px-3.5 py-3">
      <div className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </div>
      <div className={`mt-1.5 font-display text-[30px] font-bold leading-[0.9] ${valueClass}`}>
        {value}
      </div>
      <div className="mt-1.5 text-xs text-muted-foreground">{sub}</div>
    </div>
  );
}

/**
 * Every rejection the scheduler can return, in the order `evaluateEligibility`
 * applies them (`nps-scheduler/eligibility.ts`). The order is the point: the
 * two backstops run before the cheaper filters, which is what stops flipping
 * the master switch from surveying the whole historical backlog at once.
 */
const EXCEPTIONS: ReadonlyArray<{ label: string; detail: string }> = [
  {
    label: "Fora da janela retroativa",
    detail:
      "Conversa resolvida há mais tempo que o limite nunca recebe pesquisa. Trava de segurança.",
  },
  {
    label: "Ainda dentro da espera",
    detail: "A conversa foi resolvida há menos tempo que o prazo do gatilho.",
  },
  { label: "Contato com opt-out", detail: "Quem pediu para não receber não recebe." },
  {
    label: "Conversa sem mensagem humana",
    detail: "Thread que só carregou automação não mede atendimento nenhum.",
  },
  {
    label: "Já existe pesquisa ativa",
    detail: "Um telefone com pesquisa em aberto não recebe uma segunda.",
  },
  {
    label: "Dentro do intervalo mínimo",
    detail:
      "O cooldown vale por telefone e atravessa lead e cliente. Perguntar demais mede a irritação com a pesquisa, não com a empresa.",
  },
  {
    label: "Fora da janela de envio",
    detail: "Fora da faixa de horas configurada, os elegíveis aguardam o próximo ciclo.",
  },
  {
    label: "Teto diário atingido",
    detail: "Limita o estrago mesmo se a elegibilidade tiver defeito. Trava de segurança.",
  },
  {
    label: "Fora da amostragem",
    detail:
      "A escolha é estável: hash do id da conversa, nunca sorteio. O mesmo atendimento decide sempre igual.",
  },
];

export function NpsEnvioTab() {
  const provider = useNpsProvider();
  const { currentStore } = useCurrentStore();
  const storeId = currentStore?.id ?? "";

  const settingsQuery = useQuery({
    // Ids only in the key — never the object, which would be a new reference on
    // every render and quietly defeat the cache.
    queryKey: ["nps", "settings", storeId],
    queryFn: () => provider.getSettings(storeId),
    enabled: storeId.length > 0,
  });

  // The funnel is scoped to the same store as the settings above, so the tab
  // reads as one story: this configuration, these envelopes.
  const funnelFilters = useMemo(
    () => ({ windowDays: 30, storeId: storeId.length > 0 ? storeId : undefined }),
    [storeId],
  );
  const metrics = useNpsMetrics(funnelFilters);

  const settings: INpsSettings | null = settingsQuery.data ?? null;

  const surveyUrl = `${PUBLIC_BASE_URL}/pesquisa/${SAMPLE_TOKEN}`;
  const previewMessage = buildPreviewMessage(SAMPLE_FIRST_NAME, surveyUrl);

  if (!storeId) {
    return <p className="p-4 text-sm text-muted-foreground">{T.noStore}</p>;
  }

  if (settingsQuery.isLoading) {
    return <p className="p-4 text-sm text-muted-foreground">{T.loading}</p>;
  }

  const statusTone: IChipTone = settings === null ? "dormant" : settings.enabled ? "active" : "off";
  const statusTitle =
    settings === null ? T.statusUnsetTitle : settings.enabled ? T.statusOnTitle : T.statusOffTitle;
  const statusBody =
    settings === null ? T.statusUnsetBody : settings.enabled ? T.statusOnBody : T.statusOffBody;

  // Master switch off means no trigger fires, whatever its own flag says.
  const conversationTone: IChipTone =
    settings !== null && settings.enabled && settings.triggerConversationEnabled ? "active" : "off";
  const conversationStatus =
    settings === null
      ? "Sem configuração"
      : !settings.enabled
        ? "Pausado"
        : settings.triggerConversationEnabled
          ? "Ativo"
          : "Desligado";

  const data = metrics.data;
  const sent = data?.sent ?? 0;
  const answered = data?.n ?? 0;
  const silent = Math.max(0, sent - answered);
  const responseRate = Math.round((data?.responseRate ?? 0) * 100);

  return (
    <div className="flex flex-col gap-4">
      {/* Estado da chave mestra */}
      <section className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-4 py-3.5">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <span className="text-[13px] font-bold text-card-foreground">{statusTitle}</span>
            <Chip tone={statusTone}>
              {settings === null ? "Não configurado" : settings.enabled ? "Ligada" : "Desligada"}
            </Chip>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{statusBody}</p>
        </div>
        <Link
          to="/app/configuracoes/nps"
          className="ml-auto shrink-0 rounded-lg border border-border px-3 py-1.5 text-sm text-foreground hover:bg-muted"
        >
          {T.openSettings}
        </Link>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        {/* Gatilhos */}
        <Card title={T.triggersTitle} sub={T.triggersSub}>
          <div className="flex flex-col gap-2.5">
            <TriggerCard
              label="Conversa resolvida"
              code="conversation_resolved"
              tone={conversationTone}
              status={conversationStatus}
              detail={
                settings === null
                  ? "Gatilho primário: é o único com volume real hoje."
                  : `Gatilho primário — o único com volume real hoje. Espera ${settings.triggerConversationDelayHours} ${settings.triggerConversationDelayHours === 1 ? "hora" : "horas"} depois de a conversa ser marcada como resolvida.`
              }
            />
            <TriggerCard
              label="Pedido entregue"
              code="order_delivered"
              tone="dormant"
              status="Dormente"
              detail="Modelado no schema, sem agendador que o escute: a tabela de pedidos está vazia em produção, então ligá-lo renderia zero pesquisas."
            />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">{T.triggersAbsent}</p>
        </Card>

        {/* Parâmetros */}
        <Card title={T.paramsTitle} sub={T.paramsSub}>
          {settings === null ? (
            <p className="text-sm text-muted-foreground">{T.paramsUnset}</p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                <ParamItem label="Espera" value={`${settings.triggerConversationDelayHours} h`} />
                <ParamItem label="Intervalo mínimo" value={`${settings.cooldownDays} dias`} />
                <ParamItem
                  label="Janela de envio"
                  value={`${settings.sendWindowStartHour}–${settings.sendWindowEndHour} UTC`}
                />
                <ParamItem
                  label="Amostragem"
                  value={`${Math.round(settings.samplingRate * 100)}%`}
                />
                <ParamItem label="Validade do link" value={`${settings.tokenExpiryDays} dias`} />
                <ParamItem label="Mínimo de respostas" value={`${settings.minResponsesForScore}`} />
              </div>

              <div className="mt-3 rounded-lg border border-severity-warning/40 p-3">
                <div className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                  Travas contra disparo em massa
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2.5">
                  <ParamItem label="Janela retroativa" value={`${settings.maxBackfillDays} dias`} />
                  <ParamItem label="Teto diário" value={`${settings.dailyCap}/dia`} />
                </div>
              </div>

              <p className="mt-3 text-xs text-muted-foreground">{T.paramsUtcNote}</p>
            </>
          )}
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        {/* Prévia da mensagem */}
        <Card title={T.previewTitle} sub={T.previewSub}>
          <div className="max-w-md rounded-xl rounded-tl-sm border border-border bg-muted/40 px-3.5 py-3">
            <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-card-foreground">
              {previewMessage}
            </p>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            {T.previewTokenNote(settings?.tokenExpiryDays ?? null)}
          </p>
          <p className="mt-1.5 text-xs text-muted-foreground">{T.previewNote}</p>
        </Card>

        {/* Exceções */}
        <Card title={T.exceptionsTitle} sub={T.exceptionsSub}>
          <ul className="flex flex-col">
            {EXCEPTIONS.map((item) => (
              <li key={item.label} className="border-b border-border py-2 last:border-0">
                <span className="text-[12.5px] font-semibold text-card-foreground">
                  {item.label}
                </span>
                <p className="mt-0.5 text-xs text-muted-foreground">{item.detail}</p>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">{T.exceptionsNoResend}</p>
        </Card>
      </section>

      {/* Funil */}
      <Card title={T.funnelTitle} sub={T.funnelSub}>
        {metrics.isLoading ? (
          <p className="text-sm text-muted-foreground">{T.funnelLoading}</p>
        ) : sent === 0 && answered === 0 ? (
          <p className="text-sm text-muted-foreground">{T.funnelEmpty}</p>
        ) : (
          <>
            <div className="grid gap-2.5 sm:grid-cols-3">
              <FunnelStage label={T.funnelSent} value={sent} sub={T.funnelSentSub} />
              <FunnelStage
                label={T.funnelAnswered}
                value={answered}
                sub={T.funnelAnsweredSub(responseRate)}
              />
              <FunnelStage
                label={T.funnelSilent}
                value={silent}
                sub={T.funnelSilentSub}
                valueClass="text-muted-foreground"
              />
            </div>

            {answered > 0 ? (
              <div className="mt-4">
                <div className="mb-2.5 text-[10.5px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                  {T.funnelDistribution}
                </div>
                <NpsStack
                  promoters={data?.promoters ?? 0}
                  passives={data?.passives ?? 0}
                  detractors={data?.detractors ?? 0}
                  height={10}
                  labels
                />
              </div>
            ) : null}
          </>
        )}
      </Card>
    </div>
  );
}
