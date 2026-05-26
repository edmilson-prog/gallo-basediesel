import { useCallback, useMemo, useState } from "react";
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
  IConversation,
  IMessage,
  IPlatformSettings,
  ISdrResponse,
  ISdrSession,
} from "@/shared/types";
import { useCurrentStore } from "@/features/multistore";
import { SectionHeader } from "@/features/admin-settings/components/SectionHeader";
import { usePlatformSettings } from "@/features/admin-settings/hooks/usePlatformSettings";
import { applyResponseToSession, createSdrSession, sdrRespond } from "../engine/respond";

interface ISimMessage {
  id: string;
  author: "customer" | "sdr" | "system";
  text: string;
  ts: string;
  trace?: ISdrResponse["trace"];
}

const SIM_CONVERSATION_ID = "sim-conv";
const SIM_STORE_ID = "store-matriz";

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

function buildIncoming(text: string): IMessage {
  const now = new Date().toISOString();
  return {
    id: `sim-msg-${crypto.randomUUID()}`,
    conversationId: SIM_CONVERSATION_ID,
    direction: "in",
    authorType: "customer",
    provider: "mock",
    text,
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

export function SdrSimulatorPage() {
  const { currentStoreId } = useCurrentStore();
  const storeId = currentStoreId ?? SIM_STORE_ID;
  const { settings, loading } = usePlatformSettings(storeId);

  const [session, setSession] = useState<ISdrSession>(() =>
    createSdrSession(SIM_CONVERSATION_ID, new Date().toISOString()),
  );
  const [messages, setMessages] = useState<ISimMessage[]>([]);
  const [lastResponse, setLastResponse] = useState<ISdrResponse | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  const conversation = useMemo(() => buildSimConversation(storeId), [storeId]);

  const runTurn = useCallback(
    async (text: string) => {
      if (!settings) return;
      setBusy(true);
      const incoming = buildIncoming(text);
      setMessages((prev) => [
        ...prev,
        { id: incoming.id, author: "customer", text, ts: incoming.sentAt },
      ]);
      await new Promise((r) => window.setTimeout(r, 250));
      const response = sdrRespond(incoming, session, settings);
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
        }
      }
      if (newMessages.length > 0) {
        setMessages((prev) => [...prev, ...newMessages]);
      }
      setBusy(false);
    },
    [session, settings],
  );

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    void runTurn(text);
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
          busy={busy}
          sdrEnabled={settings.sdrEnabled}
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
  busy: boolean;
  sdrEnabled: boolean;
}

function ConversationColumn({
  messages,
  input,
  onInputChange,
  onSend,
  busy,
  sdrEnabled,
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
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col p-0">
        <ScrollArea className="flex-1 p-4">
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 py-12 text-center text-sm text-muted-foreground">
              <Icon icon="mdi:message-text-outline" className="size-10" />
              <p>Envie uma mensagem como cliente para iniciar a simulação.</p>
              <p className="text-xs">
                Ex.: "oi", "preciso de filtro Volvo", "quero falar com vendedor"
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

function InspectorRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="truncate text-right text-sm text-foreground">{value || "—"}</dd>
    </div>
  );
}
