import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Icon } from "@/components/Icon";
import type { ConversationChannel, ICustomer, ILead } from "@/shared/types";
import { useConversationsProvider, useCustomersProvider, useLeadsProvider } from "@/providers/data";

interface ITriggerInboundSectionProps {
  storeId: string;
  onCreated?: () => void;
}

/**
 * Operational lever to exercise the engine in development — Owner can fire a
 * synthetic inbound conversation against the current settings. Useful for
 * demoing the toast notification + the trace history without waiting for the
 * realtime simulator to spawn one.
 */
export function TriggerInboundSection({ storeId, onCreated }: ITriggerInboundSectionProps) {
  const conversationsProvider = useConversationsProvider();
  const customersProvider = useCustomersProvider();
  const leadsProvider = useLeadsProvider();
  const [customers, setCustomers] = useState<ICustomer[]>([]);
  const [leads, setLeads] = useState<ILead[]>([]);
  const [scenario, setScenario] = useState<"customer" | "lead">("lead");
  const [customerId, setCustomerId] = useState("");
  const [leadId, setLeadId] = useState("");
  const [channel, setChannel] = useState<ConversationChannel>("whatsapp");
  const [text, setText] = useState("Olá, preciso de uma peça para meu caminhão.");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      customersProvider.list({ pageSize: 30 }).then((r) => r.data),
      leadsProvider.list({ pageSize: 30 }).then((r) => r.data),
    ])
      .then(([c, l]) => {
        if (cancelled) return;
        setCustomers(c);
        setLeads(l);
        if (c[0] && !customerId) setCustomerId(c[0].id);
        if (l[0] && !leadId) setLeadId(l[0].id);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customersProvider, leadsProvider]);

  const fire = async () => {
    setBusy(true);
    try {
      const result = await conversationsProvider.create({
        storeId,
        channel,
        firstMessageText: text,
        customerId: scenario === "customer" ? customerId : undefined,
        leadId: scenario === "lead" ? leadId : undefined,
      });
      const winner = result.conversation.assignedSellerId;
      toast.success(
        winner
          ? `Conversa criada e atribuída — critério: ${result.trace.criterionMatched}.`
          : `Conversa criada — ${result.trace.criterionMatched}.`,
      );
      onCreated?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao disparar conversa de teste.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="trigger-inbound" className="space-y-3">
      <header>
        <h2 id="trigger-inbound" className="text-base font-semibold">
          Disparar conversa de teste
        </h2>
        <p className="text-sm text-muted-foreground">
          Cria uma conversa real usando as regras atuais e o engine. Aparece imediatamente na inbox
          e no histórico, com toast para o vendedor se for atribuída.
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
                  <SelectItem value="lead">Lead novo</SelectItem>
                  <SelectItem value="customer">Cliente existente</SelectItem>
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
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                  <SelectItem value="ecommerce">E-commerce</SelectItem>
                  <SelectItem value="phone">Telefone</SelectItem>
                  <SelectItem value="site">Site</SelectItem>
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
                Primeira mensagem
              </label>
              <Input value={text} onChange={(e) => setText(e.target.value)} />
            </div>
          </div>
          <div className="flex justify-end">
            <Button onClick={() => void fire()} disabled={busy}>
              <Icon icon="mdi:send" size={16} />
              <span>Disparar agora</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
