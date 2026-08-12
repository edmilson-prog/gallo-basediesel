import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useCurrentStore } from "@/features/multistore";
import { useNpsProvider } from "@/providers/data";
import type { INpsSettings } from "@/shared/types";

/**
 * /app/configuracoes/nps — Owner-facing knobs for the survey.
 *
 * Every field says what it costs to get wrong, because these are not
 * preferences: the two backstops decide whether enabling the survey messages
 * ten people or the entire historical backlog, and the minimum sample decides
 * whether the Cockpit tells the truth.
 */

const FIELD_HELP = {
  enabled:
    "Enquanto estiver desligado, nenhuma pesquisa é criada nem enviada. Ligue só depois de revisar o texto da mensagem.",
  triggerConversation:
    "Envia a pesquisa quando uma conversa é marcada como resolvida. É o único gatilho com volume hoje.",
  delayHours: "Quanto tempo esperar depois de resolver a conversa antes de perguntar.",
  cooldownDays:
    "Intervalo mínimo entre duas pesquisas para o mesmo telefone. Perguntar demais mede a irritação com a pesquisa, não com a empresa.",
  maxBackfillDays:
    "Trava de segurança: conversas resolvidas há mais tempo que isto nunca recebem pesquisa. É o que impede que ligar a chave dispare para todo o histórico de uma vez.",
  dailyCap:
    "Trava de segurança: teto de pesquisas por dia. Limita o estrago mesmo se a elegibilidade tiver defeito.",
  sendWindow:
    "Faixa de horas em que o envio pode ocorrer. Fora dela, os elegíveis aguardam o próximo ciclo.",
  samplingRate:
    "Fração dos elegíveis que recebe a pesquisa. 1 = todos. A escolha é estável: o mesmo atendimento decide sempre igual.",
  tokenExpiryDays: "Por quantos dias o link da pesquisa continua válido.",
  windowDays: "Janela usada para calcular o score exibido no Cockpit e em /app/nps.",
  minResponses:
    "Abaixo deste número de respostas, nenhuma tela mostra o score — só “Coletando dados”. Um NPS 100 de duas respostas é desinformação.",
} as const;

function NumberField({
  label,
  help,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  help: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-card-foreground">{label}</label>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step ?? 1}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-32 rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground"
      />
      <p className="text-xs text-muted-foreground">{help}</p>
    </div>
  );
}

function ToggleField({
  label,
  help,
  checked,
  onChange,
}: {
  label: string;
  help: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="flex items-center gap-2 text-sm font-medium text-card-foreground">
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          className="size-4 rounded border-border"
        />
        {label}
      </label>
      <p className="text-xs text-muted-foreground">{help}</p>
    </div>
  );
}

export function NpsSettingsPage() {
  const provider = useNpsProvider();
  const { currentStore } = useCurrentStore();
  const storeId = currentStore?.id ?? "";

  const [settings, setSettings] = useState<INpsSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!storeId) return;
    let cancelled = false;
    setLoading(true);
    provider
      .getSettings(storeId)
      .then((loaded) => {
        if (cancelled) return;
        // No row yet is the normal starting state: the survey is simply off.
        setSettings(
          loaded ?? {
            storeId,
            enabled: false,
            triggerConversationEnabled: true,
            triggerConversationDelayHours: 2,
            triggerOrderEnabled: false,
            triggerOrderDelayHours: 24,
            cooldownDays: 30,
            tokenExpiryDays: 7,
            windowDays: 90,
            samplingRate: 1,
            sendWindowStartHour: 9,
            sendWindowEndHour: 20,
            minResponsesForScore: 5,
            maxBackfillDays: 3,
            dailyCap: 50,
            whatsappAccountId: null,
          },
        );
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [provider, storeId]);

  const patch = (changes: Partial<INpsSettings>) =>
    setSettings((current) => (current ? { ...current, ...changes } : current));

  const handleSave = async () => {
    if (!settings || !storeId) return;
    setSaving(true);
    try {
      const saved = await provider.updateSettings(storeId, settings);
      setSettings(saved);
      toast.success("Configurações do NPS salvas.");
    } catch {
      toast.error("Não foi possível salvar as configurações.");
    } finally {
      setSaving(false);
    }
  };

  if (loading || !settings) {
    return <p className="p-6 text-sm text-muted-foreground">Carregando…</p>;
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold text-foreground">NPS — Pesquisa de satisfação</h1>
        <p className="text-sm text-muted-foreground">
          Quando perguntar, para quem, e com que frequência.
        </p>
      </header>

      <section className="rounded-lg border border-border bg-card p-4">
        <ToggleField
          label="Pesquisa ativa"
          help={FIELD_HELP.enabled}
          checked={settings.enabled}
          onChange={(enabled) => patch({ enabled })}
        />
      </section>

      <section className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-semibold text-card-foreground">Gatilho</h2>
        <ToggleField
          label="Conversa resolvida"
          help={FIELD_HELP.triggerConversation}
          checked={settings.triggerConversationEnabled}
          onChange={(value) => patch({ triggerConversationEnabled: value })}
        />
        <NumberField
          label="Esperar (horas)"
          help={FIELD_HELP.delayHours}
          value={settings.triggerConversationDelayHours}
          min={0}
          max={168}
          onChange={(value) => patch({ triggerConversationDelayHours: value })}
        />
      </section>

      <section className="flex flex-col gap-4 rounded-lg border border-severity-warning/40 bg-card p-4">
        <h2 className="text-sm font-semibold text-card-foreground">
          Travas de segurança contra disparo em massa
        </h2>
        <NumberField
          label="Janela retroativa (dias)"
          help={FIELD_HELP.maxBackfillDays}
          value={settings.maxBackfillDays}
          min={1}
          max={30}
          onChange={(value) => patch({ maxBackfillDays: value })}
        />
        <NumberField
          label="Teto diário por loja"
          help={FIELD_HELP.dailyCap}
          value={settings.dailyCap}
          min={1}
          max={500}
          onChange={(value) => patch({ dailyCap: value })}
        />
      </section>

      <section className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-semibold text-card-foreground">Anti-fadiga</h2>
        <NumberField
          label="Intervalo entre pesquisas (dias)"
          help={FIELD_HELP.cooldownDays}
          value={settings.cooldownDays}
          min={1}
          max={365}
          onChange={(value) => patch({ cooldownDays: value })}
        />
        <NumberField
          label="Amostragem (0 a 1)"
          help={FIELD_HELP.samplingRate}
          value={settings.samplingRate}
          min={0}
          max={1}
          step={0.05}
          onChange={(value) => patch({ samplingRate: value })}
        />
        <div className="flex flex-wrap gap-4">
          <NumberField
            label="Envio a partir de (hora)"
            help={FIELD_HELP.sendWindow}
            value={settings.sendWindowStartHour}
            min={0}
            max={23}
            onChange={(value) => patch({ sendWindowStartHour: value })}
          />
          <NumberField
            label="Envio até (hora)"
            help="Hora limite do envio."
            value={settings.sendWindowEndHour}
            min={1}
            max={24}
            onChange={(value) => patch({ sendWindowEndHour: value })}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          As horas seguem o fuso UTC do servidor. Frederico Westphalen está em UTC−3, então 9h
          locais correspondem a 12 aqui.
        </p>
      </section>

      <section className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-semibold text-card-foreground">Link e cálculo</h2>
        <NumberField
          label="Validade do link (dias)"
          help={FIELD_HELP.tokenExpiryDays}
          value={settings.tokenExpiryDays}
          min={1}
          max={90}
          onChange={(value) => patch({ tokenExpiryDays: value })}
        />
        <NumberField
          label="Janela do score (dias)"
          help={FIELD_HELP.windowDays}
          value={settings.windowDays}
          min={7}
          max={730}
          onChange={(value) => patch({ windowDays: value })}
        />
        <NumberField
          label="Mínimo de respostas"
          help={FIELD_HELP.minResponses}
          value={settings.minResponsesForScore}
          min={1}
          max={100}
          onChange={(value) => patch({ minResponsesForScore: value })}
        />
      </section>

      <div>
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          {saving ? "Salvando…" : "Salvar configurações"}
        </button>
      </div>
    </div>
  );
}
