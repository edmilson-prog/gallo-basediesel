import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import type {
  ConversationChannel,
  DistributionMatchedCriterion,
  ICustomer,
  IDistributionSettings,
  ILead,
  ISeller,
} from "@/shared/types";
import {
  distributeConversation,
  type IDistributionInput,
  type IDistributionResult,
} from "@/features/distribution/engine";
import { useCustomersProvider, useLeadsProvider, useSellersProvider } from "@/providers/data";

interface IDistributionSimulatorProps {
  storeId: string;
  settings: IDistributionSettings;
}

const CHANNELS: ConversationChannel[] = ["whatsapp", "ecommerce", "phone", "site"];

export function DistributionSimulator({ storeId, settings }: IDistributionSimulatorProps) {
  const customersProvider = useCustomersProvider();
  const leadsProvider = useLeadsProvider();
  const sellersProvider = useSellersProvider();

  const [customers, setCustomers] = useState<ICustomer[]>([]);
  const [leads, setLeads] = useState<ILead[]>([]);
  const [sellers, setSellers] = useState<ISeller[]>([]);

  const [scenario, setScenario] = useState<"customer" | "lead">("customer");
  const [customerId, setCustomerId] = useState<string>("");
  const [leadId, setLeadId] = useState<string>("");
  const [channel, setChannel] = useState<ConversationChannel>("whatsapp");
  const [firstMessage, setFirstMessage] = useState("Oi! Preciso de um filtro pra Volvo FH540.");
  const [result, setResult] = useState<IDistributionResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      customersProvider.list({ pageSize: 50 }).then((r) => r.data),
      leadsProvider.list({ pageSize: 50 }).then((r) => r.data),
      sellersProvider.list({ active: true }),
    ])
      .then(([c, l, s]) => {
        if (cancelled) return;
        setCustomers(c);
        setLeads(l);
        setSellers(s);
        if (!customerId && c[0]) setCustomerId(c[0].id);
        if (!leadId && l[0]) setLeadId(l[0].id);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customersProvider, leadsProvider, sellersProvider]);

  const run = () => {
    let participant: IDistributionInput["participant"];
    if (scenario === "customer") {
      const customer = customers.find((c) => c.id === customerId);
      if (!customer) {
        toast.error("Selecione um cliente válido para simular.");
        return;
      }
      participant = { kind: "customer", customer };
    } else {
      const lead = leads.find((l) => l.id === leadId);
      if (!lead) {
        toast.error("Selecione um lead válido para simular.");
        return;
      }
      participant = { kind: "lead", lead };
    }

    const sellersInStore = sellers.filter((s) => s.storeId === storeId);
    // Random-ish load distribution between 0 and 5 conversations per seller —
    // good enough to make the carga / round-robin steps visible.
    const loadBySeller: Record<string, number> = {};
    for (const s of sellersInStore) {
      loadBySeller[s.id] = Math.floor(Math.random() * 6);
    }

    const decision = distributeConversation(
      {
        conversationId: "sim-conversation",
        storeId,
        channel,
        participant,
        firstMessageText: firstMessage,
        occurredAt: new Date().toISOString(),
      },
      {
        settings,
        sellers: sellersInStore,
        loadBySeller,
      },
    );
    setResult(decision);
  };

  return (
    <section aria-labelledby="distribution-simulator" className="space-y-3">
      <header>
        <h2 id="distribution-simulator" className="text-base font-semibold">
          Simulador
        </h2>
        <p className="text-sm text-muted-foreground">
          Teste como uma conversa hipotética seria distribuída com as regras atuais — útil antes de
          salvar mudanças sensíveis.
        </p>
      </header>

      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Cenário
              </label>
              <Select value={scenario} onValueChange={(v) => setScenario(v as "customer" | "lead")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="customer">Cliente existente</SelectItem>
                  <SelectItem value="lead">Lead novo</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Canal
              </label>
              <Select value={channel} onValueChange={(v) => setChannel(v as ConversationChannel)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CHANNELS.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {scenario === "customer" ? (
              <div className="space-y-1 sm:col-span-2">
                <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Cliente
                </label>
                <Select value={customerId} onValueChange={setCustomerId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {customers.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.type === "B2B" ? c.nomeFantasia : c.fullName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-1 sm:col-span-2">
                <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Lead
                </label>
                <Select value={leadId} onValueChange={setLeadId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {leads.map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1 sm:col-span-2">
              <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Primeira mensagem (impacta o critério Especialidade)
              </label>
              <Input
                value={firstMessage}
                onChange={(e) => setFirstMessage(e.target.value)}
                placeholder="Texto que o cliente enviou"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={run}>Simular agora</Button>
          </div>

          {result && <SimulatorResult result={result} sellers={sellers} />}
        </CardContent>
      </Card>
    </section>
  );
}

function SimulatorResult({ result, sellers }: { result: IDistributionResult; sellers: ISeller[] }) {
  const winner = sellers.find((s) => s.id === result.selectedSellerId);
  return (
    <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
      <div className="flex items-center gap-2">
        <Icon icon={criterionIcon(result.criterionMatched)} size={20} className="text-primary" />
        <div>
          <p className="text-sm font-semibold">{describeOutcome(result, winner?.fullName)}</p>
          <p className="text-xs text-muted-foreground">
            Critério vencedor: <strong>{describeCriterion(result.criterionMatched)}</strong>
          </p>
        </div>
      </div>

      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Candidatos avaliados
        </p>
        <ul className="mt-2 space-y-1.5">
          {result.candidatesEvaluated.map((cand, idx) => {
            const seller = sellers.find((s) => s.id === cand.sellerId);
            const label = seller?.fullName ?? cand.sellerId;
            return (
              <li
                key={`${cand.sellerId}-${idx}`}
                className={cn(
                  "flex items-center gap-2 rounded border border-border/60 bg-background px-2 py-1.5 text-xs",
                  cand.selected && "border-primary/50 bg-primary/10",
                )}
              >
                <Icon
                  icon={cand.selected ? "mdi:check-circle" : "mdi:circle-outline"}
                  size={14}
                  className={cand.selected ? "text-primary" : "text-muted-foreground"}
                />
                <span className="font-medium">{label}</span>
                <span className="text-muted-foreground">{cand.reason}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function criterionIcon(c: DistributionMatchedCriterion): string {
  switch (c) {
    case "carteira":
      return "mdi:account-tie-outline";
    case "especialidade":
      return "mdi:school-outline";
    case "round_robin":
      return "mdi:rotate-3d-variant";
    case "carga":
      return "mdi:scale-balance";
    case "fallback_sdr":
      return "mdi:robot-happy-outline";
    case "fallback_fila":
      return "mdi:timer-sand";
  }
}

function describeCriterion(c: DistributionMatchedCriterion): string {
  const map: Record<DistributionMatchedCriterion, string> = {
    carteira: "Carteira",
    especialidade: "Especialidade",
    round_robin: "Round-robin",
    carga: "Carga",
    fallback_sdr: "Fallback — SDR",
    fallback_fila: "Fallback — Fila",
  };
  return map[c];
}

function describeOutcome(result: IDistributionResult, winnerName?: string): string {
  if (result.criterionMatched === "fallback_sdr") {
    return "SDR assumiria a conversa.";
  }
  if (result.criterionMatched === "fallback_fila") {
    return "A conversa entraria em fila aguardando atribuição.";
  }
  return `${winnerName ?? "Vendedor"} receberia a conversa.`;
}
