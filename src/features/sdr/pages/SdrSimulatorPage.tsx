import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import type {
  ICustomer,
  IConversation,
  IMessage,
  IPart,
  IPartIdentification,
  IPlatformSettings,
  ISdrResponse,
  ISdrSession,
} from "@/shared/types";
import { useCurrentStore } from "@/features/multistore";
import { SectionHeader } from "@/features/admin-settings/components/SectionHeader";
import { usePlatformSettings } from "@/features/admin-settings/hooks/usePlatformSettings";
import { usePartsProvider } from "@/providers/data";
import { SCORE_WEIGHTS } from "@/features/part-identification";
import { applyResponseToSession, createSdrSession, sdrRespond } from "../engine/respond";

interface ISimMessage {
  id: string;
  author: "customer" | "sdr" | "system";
  text: string;
  ts: string;
  mediaType?: "image";
  trace?: ISdrResponse["trace"];
}

const SIM_CONVERSATION_ID = "sim-conv";
const SIM_STORE_ID = "00000000-0000-0000-0000-000000000001";

/**
 * Stub customer wired into the simulator so the PRD-022 quote path runs
 * end-to-end without an actual ICustomer being attached to the dummy
 * conversation. Address is in Frederico Westphalen so the placeholder
 * shipping rule returns `sameCityValue`.
 */
const SIM_CUSTOMER: ICustomer = {
  id: "sim-customer",
  storeId: SIM_STORE_ID,
  type: "B2C",
  cpf: "000.000.000-00",
  fullName: "Cliente Simulação",
  phone: "+55 55 90000-0000",
  email: "simulacao@gallo-basediesel.test",
  address: {
    street: "Av. Brasil",
    number: "1500",
    district: "Centro",
    city: "Frederico Westphalen",
    state: "RS",
    zipCode: "98400-000",
  },
  sellerId: "sim-seller",
  status: "ativo",
  tags: [],
  notes: [],
  createdAt: new Date().toISOString(),
};

function buildSimConversation(storeId: string): IConversation {
  return {
    id: SIM_CONVERSATION_ID,
    storeId,
    channel: "whatsapp",
    status: "em_andamento",
    isSdrActive: true,
    tags: [],
    lastMessageAt: new Date().toISOString(),
    unreadCount: 0,
    createdAt: new Date().toISOString(),
  };
}

function buildIncoming(text: string, mediaType?: "image"): IMessage {
  const now = new Date().toISOString();
  return {
    id: `sim-msg-${crypto.randomUUID()}`,
    conversationId: SIM_CONVERSATION_ID,
    direction: "in",
    authorType: "customer",
    provider: "mock",
    text,
    mediaType,
    status: "delivered",
    sentAt: now,
    deliveredAt: now,
  };
}

const STATE_BADGE_TONE: Record<ISdrSession["state"], string> = {
  saudacao: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  identificacao: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
  qualificacao: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  roteamento: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  aguardando_humano: "bg-orange-500/10 text-orange-700 dark:text-orange-300",
  pausado: "bg-muted text-muted-foreground",
  finalizado: "bg-slate-500/10 text-slate-700 dark:text-slate-300",
};

function confidenceTone(conf: number): string {
  if (conf >= 0.85) return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  if (conf >= 0.6) return "bg-amber-500/10 text-amber-700 dark:text-amber-300";
  if (conf > 0) return "bg-rose-500/10 text-rose-700 dark:text-rose-300";
  return "bg-muted text-muted-foreground";
}

function formatConfidence(conf: number | undefined): string {
  if (conf === undefined || conf === 0) return "—";
  return `${Math.round(conf * 100)}%`;
}

export function SdrSimulatorPage() {
  const { currentStoreId } = useCurrentStore();
  const storeId = currentStoreId ?? SIM_STORE_ID;
  const { settings, loading } = usePlatformSettings(storeId);
  const partsProvider = usePartsProvider();

  const [session, setSession] = useState<ISdrSession>(() =>
    createSdrSession(SIM_CONVERSATION_ID, new Date().toISOString()),
  );
  const [messages, setMessages] = useState<ISimMessage[]>([]);
  const [lastResponse, setLastResponse] = useState<ISdrResponse | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [parts, setParts] = useState<IPart[]>([]);
  const [partsLoading, setPartsLoading] = useState(true);

  const conversation = useMemo(() => buildSimConversation(storeId), [storeId]);

  useEffect(() => {
    let cancelled = false;
    setPartsLoading(true);
    partsProvider
      .list({ pageSize: 60 })
      .then((page) => {
        if (cancelled) return;
        setParts(page.items);
      })
      .catch((err) => {
        if (import.meta.env.DEV) console.warn("[sdr-sim] parts load failed", err);
      })
      .finally(() => {
        if (!cancelled) setPartsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [partsProvider]);

  const runTurn = useCallback(
    async (text: string, mediaType?: "image") => {
      if (!settings) return;
      setBusy(true);
      const incoming = buildIncoming(text, mediaType);
      const displayText = mediaType === "image" ? `📷 [imagem]${text ? ` ${text}` : ""}` : text;
      setMessages((prev) => [
        ...prev,
        { id: incoming.id, author: "customer", text: displayText, ts: incoming.sentAt, mediaType },
      ]);
      await new Promise((r) => window.setTimeout(r, 250));
      const response = sdrRespond(incoming, session, settings, {
        parts,
        customer: SIM_CUSTOMER,
        storeId,
        sellerId: "sim-seller",
      });
      const next = applyResponseToSession(session, response, new Date().toISOString());
      setSession(next);
      setLastResponse(response);
      const newMessages: ISimMessage[] = [];
      for (const action of response.actions) {
        if (action.kind === "send_message") {
          await new Promise((r) => window.setTimeout(r, 350));
          newMessages.push({
            id: `sim-msg-${crypto.randomUUID()}`,
            author: "sdr",
            text: action.text,
            ts: new Date().toISOString(),
            trace: response.trace,
          });
        } else if (action.kind === "escalate_to_human") {
          newMessages.push({
            id: `sim-msg-${crypto.randomUUID()}`,
            author: "system",
            text: "🤖 SDR escalou para humano",
            ts: new Date().toISOString(),
          });
        } else if (action.kind === "finish") {
          newMessages.push({
            id: `sim-msg-${crypto.randomUUID()}`,
            author: "system",
            text: `🤖 Sessão finalizada (${action.reason})`,
            ts: new Date().toISOString(),
          });
        } else if (action.kind === "create_quote") {
          newMessages.push({
            id: `sim-msg-${crypto.randomUUID()}`,
            author: "system",
            text: `🤖 Orçamento solicitado${action.partId ? ` (peça ${action.partId})` : ""}`,
            ts: new Date().toISOString(),
          });
        } else if (action.kind === "quote_generated") {
          newMessages.push({
            id: `sim-msg-${crypto.randomUUID()}`,
            author: "system",
            text: `🧾 Orçamento gerado (${action.pending.partName}) — total R$ ${action.pending.total.toFixed(2).replace(".", ",")}`,
            ts: new Date().toISOString(),
          });
        } else if (action.kind === "quote_response") {
          newMessages.push({
            id: `sim-msg-${crypto.randomUUID()}`,
            author: "system",
            text: `🤖 Resposta detectada: ${action.intent}${action.matchedKeywords.length > 0 ? ` (${action.matchedKeywords.join(", ")})` : ""}`,
            ts: new Date().toISOString(),
          });
        }
      }
      if (newMessages.length > 0) {
        setMessages((prev) => [...prev, ...newMessages]);
      }
      setBusy(false);
    },
    [parts, session, settings, storeId],
  );

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    void runTurn(text);
  }, [busy, input, runTurn]);

  const handleSendPhoto = useCallback(() => {
    if (busy) return;
    void runTurn(input.trim(), "image");
    setInput("");
  }, [busy, input, runTurn]);

  const handleReset = useCallback(() => {
    setSession(createSdrSession(SIM_CONVERSATION_ID, new Date().toISOString()));
    setMessages([]);
    setLastResponse(null);
    toast.success("Simulação reiniciada");
  }, []);

  const handleSaveTestCase = useCallback(() => {
    if (messages.length === 0) {
      toast.info("Nada para salvar — envie pelo menos uma mensagem.");
      return;
    }
    const payload = {
      capturedAt: new Date().toISOString(),
      session,
      messages,
    };
    try {
      const key = `gallo-sdr-test-cases`;
      const existing = JSON.parse(window.localStorage.getItem(key) ?? "[]");
      existing.push(payload);
      window.localStorage.setItem(key, JSON.stringify(existing));
      toast.success("Caso de teste salvo localmente (Fase 2: persistência remota).");
    } catch (err) {
      toast.error("Não foi possível salvar localmente.");
      if (import.meta.env.DEV) console.warn(err);
    }
  }, [messages, session]);

  if (loading || !settings) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Simulador do SDR"
        description="Teste o agente IA simulado com mensagens reais. Útil para validar templates, debugar fluxos e demonstrar para clientes — não afeta produção."
        action={
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleSaveTestCase}>
              <Icon icon="mdi:content-save-outline" className="size-4" />
              Salvar caso
            </Button>
            <Button variant="outline" onClick={handleReset}>
              <Icon icon="mdi:refresh" className="size-4" />
              Reiniciar
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <ConversationColumn
          messages={messages}
          input={input}
          onInputChange={setInput}
          onSend={handleSend}
          onSendPhoto={handleSendPhoto}
          busy={busy}
          sdrEnabled={settings.sdrEnabled}
          partsLoading={partsLoading}
        />
        <InspectorColumn session={session} response={lastResponse} settings={settings} />
      </div>
    </div>
  );
}

interface IConversationColumnProps {
  messages: ISimMessage[];
  input: string;
  onInputChange: (next: string) => void;
  onSend: () => void;
  onSendPhoto: () => void;
  busy: boolean;
  sdrEnabled: boolean;
  partsLoading: boolean;
}

function ConversationColumn({
  messages,
  input,
  onInputChange,
  onSend,
  onSendPhoto,
  busy,
  sdrEnabled,
  partsLoading,
}: IConversationColumnProps) {
  return (
    <Card className="flex h-[600px] flex-col">
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon icon="mdi:robot-happy" className="size-5 text-primary" />
          Conversa simulada
          {!sdrEnabled && (
            <Badge variant="destructive" className="ml-2">
              SDR desabilitado
            </Badge>
          )}
          {partsLoading && (
            <Badge variant="secondary" className="ml-2 text-xs">
              Carregando catálogo…
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col p-0">
        <ScrollArea className="flex-1 p-4">
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 py-12 text-center text-sm text-muted-foreground">
              <Icon icon="mdi:message-text-outline" className="size-10" />
              <p>Envie uma mensagem como cliente para iniciar a simulação.</p>
              <p className="text-xs">
                Ex.: "oi", "preciso de filtro de óleo Volvo FH 460 2020", "quero falar com vendedor"
              </p>
            </div>
          ) : (
            <ul className="space-y-3">
              {messages.map((m) => (
                <li key={m.id} className="flex">
                  <SimBubble message={m} />
                </li>
              ))}
              {busy && (
                <li className="flex">
                  <div className="ml-0 max-w-[80%] rounded-2xl bg-muted px-3 py-2 text-sm text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <span className="size-1.5 animate-pulse rounded-full bg-foreground/40" />
                      <span className="size-1.5 animate-pulse rounded-full bg-foreground/40 [animation-delay:120ms]" />
                      <span className="size-1.5 animate-pulse rounded-full bg-foreground/40 [animation-delay:240ms]" />
                    </span>
                  </div>
                </li>
              )}
            </ul>
          )}
        </ScrollArea>
        <div className="border-t p-3">
          <div className="flex gap-2">
            <Input
              value={input}
              onChange={(e) => onInputChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  onSend();
                }
              }}
              placeholder="Digite como cliente…"
              disabled={busy}
              aria-label="Mensagem do cliente"
            />
            <Button
              type="button"
              variant="outline"
              onClick={onSendPhoto}
              disabled={busy}
              title="Simular envio de foto (placeholder OCR)"
              aria-label="Enviar foto simulada"
            >
              <Icon icon="mdi:image-outline" className="size-4" />
            </Button>
            <Button onClick={onSend} disabled={busy || input.trim().length === 0}>
              <Icon icon="mdi:send" className="size-4" />
              Enviar
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SimBubble({ message }: { message: ISimMessage }) {
  if (message.author === "system") {
    return (
      <div className="mx-auto rounded-md bg-muted px-3 py-1.5 text-xs text-muted-foreground">
        {message.text}
      </div>
    );
  }
  const isCustomer = message.author === "customer";
  return (
    <div className={`flex w-full ${isCustomer ? "justify-start" : "justify-end"}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap ${
          isCustomer
            ? "bg-muted text-foreground"
            : "bg-primary/10 text-foreground ring-1 ring-primary/20"
        }`}
      >
        {!isCustomer && (
          <div className="mb-1 inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-primary">
            <Icon icon="mdi:robot" className="size-3" /> SDR
          </div>
        )}
        <div>{message.text}</div>
      </div>
    </div>
  );
}

interface IInspectorColumnProps {
  session: ISdrSession;
  response: ISdrResponse | null;
  settings: IPlatformSettings;
}

function InspectorColumn({ session, response, settings }: IInspectorColumnProps) {
  const identification =
    response?.trace.partIdentification ?? session.collectedData.pendingPartIdentification ?? null;
  const usedFallback = response?.trace.partIdentificationUsedFallback ?? false;
  const history = session.collectedData.partIdentificationHistory ?? [];

  return (
    <Card className="h-[600px]">
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon icon="mdi:magnify-scan" className="size-5 text-primary" />
          Inspetor
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 p-4 overflow-y-auto h-[calc(100%-65px)]">
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Estado da sessão
          </h3>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATE_BADGE_TONE[session.state]}`}
            >
              {session.state}
            </span>
            {session.finishReason && (
              <Badge variant="outline" className="text-xs">
                {session.finishReason}
              </Badge>
            )}
          </div>
        </section>

        <Separator />

        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Dados coletados
          </h3>
          <dl className="mt-2 space-y-1 text-sm">
            <InspectorRow label="Nome" value={session.collectedData.name} />
            <InspectorRow label="Empresa" value={session.collectedData.company} />
            <InspectorRow label="Telefone" value={session.collectedData.phone} />
            <InspectorRow label="Necessidade" value={session.collectedData.needs} />
            <InspectorRow label="Peça identificada" value={session.collectedData.identifiedPart} />
            <InspectorRow label="Orçamento" value={session.collectedData.quoteId} />
          </dl>
        </section>

        <Separator />

        <PartIdentificationSection identification={identification} usedFallback={usedFallback} />

        <Separator />

        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Último turno
          </h3>
          {!response ? (
            <p className="mt-2 text-sm text-muted-foreground">
              Envie uma mensagem para inspecionar o último turno do SDR.
            </p>
          ) : (
            <dl className="mt-2 space-y-1 text-sm">
              <InspectorRow label="Intent detectada" value={response.trace.detectedIntent} />
              <InspectorRow label="Template usado" value={response.trace.templateUsed} />
              <InspectorRow
                label="Variáveis usadas"
                value={
                  Object.keys(response.trace.variablesUsed).length === 0
                    ? "—"
                    : JSON.stringify(response.trace.variablesUsed)
                }
              />
              <InspectorRow
                label="Keywords"
                value={
                  response.trace.candidatesEvaluated.length === 0
                    ? "—"
                    : response.trace.candidatesEvaluated.join(", ")
                }
              />
              <InspectorRow label="Ações" value={response.actions.length.toString()} />
            </dl>
          )}
        </section>

        {history.length > 0 && (
          <>
            <Separator />
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Histórico de identificações ({history.length})
              </h3>
              <ul className="mt-2 max-h-40 space-y-2 overflow-y-auto text-xs">
                {history.map((entry) => (
                  <li
                    key={entry.id}
                    className="rounded-md border border-border/60 bg-muted/40 px-2 py-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-foreground">
                        {entry.candidates[0]?.partName ?? "—"}
                      </span>
                      <Badge
                        variant="outline"
                        className={`text-[10px] ${
                          entry.status === "confirmed"
                            ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-300"
                            : entry.status === "failed"
                              ? "border-rose-500/40 text-rose-700 dark:text-rose-300"
                              : "border-muted-foreground/40"
                        }`}
                      >
                        {entry.status}
                      </Badge>
                    </div>
                    <div className="mt-0.5 truncate text-muted-foreground">
                      “{entry.rawInput.slice(0, 60)}
                      {entry.rawInput.length > 60 ? "…" : ""}”
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}

        <Separator />

        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Templates ativos
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {settings.sdrTemplates.length} templates configurados
          </p>
          <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto text-xs">
            {settings.sdrTemplates.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-2">
                <span className="font-mono text-[11px] text-muted-foreground">{t.trigger}</span>
                <span className="truncate text-foreground/80">{t.text.slice(0, 38)}…</span>
              </li>
            ))}
          </ul>
        </section>
      </CardContent>
    </Card>
  );
}

interface IPartIdSectionProps {
  identification: IPartIdentification | null;
  usedFallback: boolean;
}

function PartIdentificationSection({ identification, usedFallback }: IPartIdSectionProps) {
  if (!identification) {
    return (
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Identificação de peça (PRD-021)
        </h3>
        <p className="mt-2 text-xs text-muted-foreground">
          Envie uma mensagem com intent de peça (ex.:{" "}
          <em>"preciso de filtro de óleo Volvo FH 460 2020"</em>) para acionar o engine.
        </p>
      </section>
    );
  }

  const aggregateTone = confidenceTone(identification.confidence);
  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Identificação de peça (PRD-021)
        </h3>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${aggregateTone}`}>
          {formatConfidence(identification.confidence)}
        </span>
      </div>
      {usedFallback && (
        <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-300">
          Catálogo em construção — exibindo candidatos de exemplo.
        </p>
      )}

      <div className="mt-2">
        <p className="text-[11px] font-semibold text-foreground/80">Atributos extraídos</p>
        <ul className="mt-1 grid grid-cols-2 gap-1 text-[11px]">
          <AttributeChip
            label="Marca"
            value={identification.extractedAttributes.brand}
            confidence={identification.attributeConfidence.brand}
          />
          <AttributeChip
            label="Modelo"
            value={identification.extractedAttributes.model}
            confidence={identification.attributeConfidence.model}
          />
          <AttributeChip
            label="Ano"
            value={identification.extractedAttributes.year?.toString()}
            confidence={identification.attributeConfidence.year}
          />
          <AttributeChip
            label="Motor"
            value={identification.extractedAttributes.engine}
            confidence={identification.attributeConfidence.engine}
          />
          <AttributeChip
            label="Categoria"
            value={identification.extractedAttributes.partCategory}
            confidence={identification.attributeConfidence.partCategory}
          />
          <AttributeChip
            label="Subtipo"
            value={identification.extractedAttributes.partSubtype}
            confidence={identification.attributeConfidence.partSubtype}
          />
          {identification.extractedAttributes.oemCode && (
            <AttributeChip
              label="OEM"
              value={identification.extractedAttributes.oemCode}
              confidence={identification.attributeConfidence.oemCode}
            />
          )}
        </ul>
      </div>

      <div className="mt-3">
        <p className="text-[11px] font-semibold text-foreground/80">Decisão</p>
        <div className="mt-1 flex items-center gap-2">
          <Badge variant="secondary" className="text-[10px]">
            {identification.decision.kind}
          </Badge>
          <span className="text-[11px] text-muted-foreground">
            {identification.decision.reason}
          </span>
        </div>
      </div>

      <div className="mt-3">
        <p className="text-[11px] font-semibold text-foreground/80">
          Candidatos ({identification.candidates.length})
        </p>
        {identification.candidates.length === 0 ? (
          <p className="mt-1 text-[11px] text-muted-foreground">Nenhum candidato encontrado.</p>
        ) : (
          <ul className="mt-1 space-y-1">
            {identification.candidates.slice(0, 5).map((c) => (
              <li
                key={c.partId}
                className="rounded-md border border-border/60 bg-muted/40 px-2 py-1.5 text-[11px]"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium text-foreground">{c.partName}</span>
                  <span
                    className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] ${confidenceTone(c.score)}`}
                  >
                    {formatConfidence(c.score)}
                  </span>
                </div>
                <div className="mt-0.5 flex items-center justify-between text-muted-foreground">
                  <span>
                    {c.partBrand ?? "—"}
                    {c.isEquivalent ? " · equiv." : ""}
                  </span>
                  <span>
                    {c.estimatedPrice != null
                      ? `R$ ${c.estimatedPrice.toFixed(2).replace(".", ",")}`
                      : ""}
                  </span>
                </div>
                {c.matchedAttributes.length > 0 && (
                  <div className="mt-0.5 text-[10px] text-muted-foreground">
                    match: {c.matchedAttributes.join(", ")}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="mt-2 text-[10px] text-muted-foreground">
        Pesos: marca {SCORE_WEIGHTS.brand} · modelo {SCORE_WEIGHTS.model} · ano{" "}
        {SCORE_WEIGHTS.yearInRange} · motor {SCORE_WEIGHTS.engine} · categoria{" "}
        {SCORE_WEIGHTS.partCategory} · equiv. {SCORE_WEIGHTS.equivalentPenalty}
      </p>
    </section>
  );
}

interface IAttributeChipProps {
  label: string;
  value?: string;
  confidence?: number;
}

function AttributeChip({ label, value, confidence }: IAttributeChipProps) {
  const conf = confidence ?? 0;
  return (
    <li className={`rounded-md px-1.5 py-1 ${confidenceTone(conf)}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[9px] uppercase tracking-wide opacity-70">{label}</span>
        <span className="text-[9px] font-semibold opacity-70">{formatConfidence(conf)}</span>
      </div>
      <div className="truncate text-[11px] font-medium">{value || "—"}</div>
    </li>
  );
}

function InspectorRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="truncate text-right text-sm text-foreground">{value || "—"}</dd>
    </div>
  );
}
