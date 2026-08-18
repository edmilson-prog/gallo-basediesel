import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import { Icon } from "@/components/Icon";
import type { INpsSettings } from "@/shared/types";
import { useNpsSettings, useSaveNpsSettings } from "../hooks/useNpsSettings";
import { PREVIEW_TOKEN } from "../pages/NpsSurveyPublicPage";
import { NpsCard, NpsConfigRow, NpsFactRow, NpsNotWired, NpsSeg, NpsToggle } from "./NpsKit";

/**
 * "Envio da pesquisa" — the kit's `NpsEnvio` (`nps-views.jsx`).
 *
 * The kit lists four triggers (OS fechada, pedido entregue, orçamento recusado,
 * visita técnica) drawn from a workshop this product does not run yet. Only two
 * of them exist here, so only two are offered: a switch for a trigger nothing
 * implements would read as a promise the scheduler never keeps.
 *
 * The two mass-dispatch backstops — retroactive window and daily cap — are NOT
 * repeated here. They live on /app/configuracoes/nps, behind the Owner, because
 * they are the difference between switching the survey on and messaging the
 * entire backlog at once.
 */

const DELAY_OPTIONS = [
  { value: 0, label: "Imediato" },
  { value: 4, label: "4h" },
  { value: 24, label: "24h" },
  { value: 72, label: "72h" },
] as const;

const COOLDOWN_OPTIONS = [
  { value: 30, label: "30 dias" },
  { value: 90, label: "90 dias" },
  { value: 180, label: "180 dias" },
] as const;

/** UTC−3, the timezone both stores actually operate in. */
const STORE_UTC_OFFSET = -3;

function localHour(utcHour: number): number {
  return (((utcHour + STORE_UTC_OFFSET) % 24) + 24) % 24;
}

const SAMPLE_MESSAGE =
  "Oi, José! Aqui é da GALLO Base Diesel. Seu atendimento foi concluído — de 0 a 10, " +
  "qual a chance de você nos recomendar para um colega? É rapidinho:";

export function NpsEnvioTab() {
  const settingsQuery = useNpsSettings();
  const save = useSaveNpsSettings();
  const [draft, setDraft] = useState<INpsSettings | null>(null);

  useEffect(() => {
    if (settingsQuery.data) setDraft(settingsQuery.data);
  }, [settingsQuery.data]);

  if (!draft) {
    return <p className="py-12 text-center text-[13.5px] text-muted-foreground">Carregando…</p>;
  }

  const patch = (changes: Partial<INpsSettings>) =>
    setDraft((current) => (current ? { ...current, ...changes } : current));

  const dirty =
    settingsQuery.data !== undefined &&
    JSON.stringify(draft) !== JSON.stringify(settingsQuery.data);

  const handleSave = () => {
    save.mutate(draft, {
      onSuccess: () => toast.success("Configuração de envio salva."),
      onError: () => toast.error("Não foi possível salvar."),
    });
  };

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[1.35fr_1fr]">
      <div className="flex flex-col gap-4">
        <NpsCard
          title="Gatilhos"
          icon="lucide:zap"
          iconTone="primary"
          sub="quando a pesquisa é disparada"
        >
          <NpsConfigRow
            label="Conversa resolvida"
            help="Envia quando um atendimento é marcado como resolvido. É o único gatilho com volume hoje."
          >
            <NpsToggle
              label="Conversa resolvida"
              checked={draft.triggerConversationEnabled}
              onChange={(value) => patch({ triggerConversationEnabled: value })}
            />
          </NpsConfigRow>

          <NpsConfigRow
            label="Pedido entregue"
            help="Conta a partir da baixa da entrega, não da emissão."
            note="Produção ainda não registra pedidos — ligar isto não dispara nada hoje."
          >
            <NpsToggle
              label="Pedido entregue"
              checked={draft.triggerOrderEnabled}
              onChange={(value) => patch({ triggerOrderEnabled: value })}
            />
          </NpsConfigRow>

          <div className="pt-3.5">
            <NpsNotWired>
              O kit prevê ainda “orçamento recusado” e “visita técnica industrial”. Nenhum dos dois
              existe no schema — a divisão INDUSTRIAL segue modelada e dormente, e orçamento não tem
              evento de recusa. Ficam de fora até existirem.
            </NpsNotWired>
          </div>
        </NpsCard>

        <NpsCard title="Ritmo" icon="lucide:clock" sub="prazo, repetição e janela de envio">
          <NpsConfigRow
            label="Prazo após o gatilho"
            help="tempo entre a conclusão e o envio do link"
          >
            <NpsSeg
              ariaLabel="Prazo após o gatilho"
              items={DELAY_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
              value={draft.triggerConversationDelayHours}
              onChange={(value) => patch({ triggerConversationDelayHours: value })}
            />
          </NpsConfigRow>

          <NpsConfigRow
            label="Intervalo mínimo por cliente"
            help="não pergunta de novo antes disso, mesmo com novo atendimento — perguntar demais mede a irritação com a pesquisa, não com a empresa"
          >
            <NpsSeg
              ariaLabel="Intervalo mínimo por cliente"
              items={COOLDOWN_OPTIONS.map((option) => ({
                value: option.value,
                label: option.label,
              }))}
              value={draft.cooldownDays}
              onChange={(value) => patch({ cooldownDays: value })}
            />
          </NpsConfigRow>

          <NpsConfigRow
            label="Amostragem"
            help="fração dos elegíveis que recebe. 1 = todos. A escolha é estável: o mesmo atendimento decide sempre igual."
          >
            <input
              type="number"
              min={0}
              max={1}
              step={0.05}
              value={draft.samplingRate}
              onChange={(event) => patch({ samplingRate: Number(event.target.value) })}
              className="w-24 rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground"
            />
          </NpsConfigRow>

          <NpsConfigRow
            label="Janela de envio"
            help={`horas em que o disparo pode ocorrer. Gravadas em UTC: ${draft.sendWindowStartHour}h–${draft.sendWindowEndHour}h UTC são ${localHour(draft.sendWindowStartHour)}h–${localHour(draft.sendWindowEndHour)}h no horário da loja.`}
          >
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                max={23}
                aria-label="Envio a partir de (hora UTC)"
                value={draft.sendWindowStartHour}
                onChange={(event) => patch({ sendWindowStartHour: Number(event.target.value) })}
                className="w-20 rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground"
              />
              <span className="text-xs text-muted-foreground">até</span>
              <input
                type="number"
                min={1}
                max={24}
                aria-label="Envio até (hora UTC)"
                value={draft.sendWindowEndHour}
                onChange={(event) => patch({ sendWindowEndHour: Number(event.target.value) })}
                className="w-20 rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground"
              />
            </div>
          </NpsConfigRow>

          <div className="pt-3.5">
            <NpsNotWired>
              O kit prevê um <b>reenvio único</b> — um lembrete três dias depois para quem não
              respondeu. O <code className="font-mono">nps-scheduler</code> não implementa isso: ele
              cria uma pesquisa por atendimento e nunca insiste. O interruptor fica de fora enquanto
              não houver o comportamento por trás.
            </NpsNotWired>
          </div>
        </NpsCard>

        <NpsCard title="Exceções" icon="lucide:user-x" sub="quem nunca recebe">
          <ul className="flex flex-col gap-2 text-[12.5px] text-muted-foreground">
            <li className="flex items-start gap-2">
              <Icon icon="lucide:check" size={14} className="mt-0.5 shrink-0 text-primary" />
              Quem já respondeu dentro do intervalo mínimo ({draft.cooldownDays} dias).
            </li>
            <li className="flex items-start gap-2">
              <Icon icon="lucide:check" size={14} className="mt-0.5 shrink-0 text-primary" />
              Conversas resolvidas há mais de {draft.maxBackfillDays} dias — a trava que impede o
              disparo do histórico inteiro ao ligar a chave.
            </li>
            <li className="flex items-start gap-2">
              <Icon icon="lucide:check" size={14} className="mt-0.5 shrink-0 text-primary" />
              Tudo que exceder o teto de {draft.dailyCap} pesquisas no dia.
            </li>
          </ul>
          <div className="mt-3.5">
            <NpsNotWired>
              Lista nominal de exclusão (“fulano pediu para não receber”) ainda não existe. Hoje a
              saída é o intervalo mínimo. As duas travas acima se editam em{" "}
              <Link to="/app/configuracoes/nps" className="font-bold text-primary hover:underline">
                Configurações › NPS
              </Link>
              .
            </NpsNotWired>
          </div>
        </NpsCard>
      </div>

      <div className="flex flex-col gap-4">
        <NpsCard title="Prévia da mensagem" icon="lucide:link" sub="link web curto">
          {/* Deliberately light: this is what lands on the customer's phone, and
              showing it in the app's dark chrome would misrepresent it. */}
          <div className="rounded-xl bg-[#F6F6F7] px-4 py-4">
            <div className="font-display text-[13px] font-extrabold uppercase tracking-[0.04em] text-[#231F20]">
              Gallo Base Diesel
            </div>
            <p className="mt-2 text-[13.5px] leading-relaxed text-[#3A3A3C]">{SAMPLE_MESSAGE}</p>
            <div className="mt-3 text-[13.5px] font-bold text-[#9A7820]">
              crm.gallobasediesel.com.br/pesquisa/…
            </div>
            <div className="mt-3.5 border-t border-[#D7D8DA] pt-3 text-xs text-[#767678]">
              Uma resposta por atendimento. O link vale {draft.tokenExpiryDays} dias.
            </div>
          </div>

          <p className="mt-3 text-xs text-muted-foreground">
            Texto exato de <code className="font-mono">nps-scheduler/message.ts</code>. Não é
            editável pela tela: mudar a copy é mudar o que sai para o cliente, e passa por deploy.
          </p>

          <div className="mt-3">
            <Link
              to="/pesquisa/$token"
              params={{ token: PREVIEW_TOKEN }}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[12.5px] font-bold text-card-foreground hover:bg-muted"
            >
              <Icon icon="lucide:smartphone" size={14} className="text-primary" />
              Abrir a pesquisa como o cliente vê
            </Link>
          </div>
        </NpsCard>

        <NpsCard title="Estado do envio" icon="lucide:activity">
          <NpsFactRow
            label="Pesquisa ativa"
            value={
              draft.enabled ? (
                <span className="text-severity-success">Sim</span>
              ) : (
                <span className="text-severity-warning">Não</span>
              )
            }
          />
          <NpsFactRow label="Teto diário" value={`${draft.dailyCap} por loja`} />
          <NpsFactRow label="Janela retroativa" value={`${draft.maxBackfillDays} dias`} />
          <NpsFactRow label="Validade do link" value={`${draft.tokenExpiryDays} dias`} />
          <NpsFactRow label="Mínimo para exibir score" value={`${draft.minResponsesForScore}`} />
          <p className="mt-3 text-xs text-muted-foreground">
            A chave geral e as duas travas ficam em{" "}
            <Link to="/app/configuracoes/nps" className="font-bold text-primary hover:underline">
              Configurações › NPS
            </Link>
            , onde só o Owner escreve.
          </p>
        </NpsCard>

        <div className="flex gap-2">
          <button
            type="button"
            disabled={!dirty || save.isPending}
            onClick={handleSave}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2.5 text-[13.5px] font-bold text-primary-foreground disabled:opacity-50"
          >
            <Icon icon="lucide:check" size={15} />
            {save.isPending ? "Salvando…" : "Salvar envio"}
          </button>
          {dirty ? (
            <button
              type="button"
              onClick={() => setDraft(settingsQuery.data ?? null)}
              className="rounded-lg border border-border px-4 py-2.5 text-[13.5px] font-bold text-muted-foreground hover:bg-muted"
            >
              Descartar
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
