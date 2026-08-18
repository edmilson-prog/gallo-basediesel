import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Icon } from "@/components/Icon";
import type { INpsSettings } from "@/shared/types";
import { NPS_READING_DEFAULTS, bandsOf, npsBandRanges, npsBandsAreOrdered } from "../engine";
import { useNpsSettings, useSaveNpsSettings } from "../hooks/useNpsSettings";
import { NpsCard, NpsConfigRow, NpsFactRow, NpsNotWired, NpsSeg, NpsToggle } from "./NpsKit";
import { NpsRuler } from "./NpsPanelParts";

/**
 * "Parâmetros do NPS" — the kit's `NpsParametros` (`nps-views.jsx`).
 *
 * Everything here changes how the same answers are *read*, never which answers
 * exist. Moving the target or a band cut re-labels history; it never re-sends
 * anything and never edits a score. That separation is why this tab is safe to
 * hand to a manager while /app/configuracoes/nps stays with the Owner.
 *
 * The arithmetic itself is not configurable and the "Cálculo" card says so: the
 * 0–6 / 7–8 / 9–10 split and the promoters-minus-detractors formula are the
 * definition of NPS, and a company that edits them is no longer comparable to
 * anyone, including its own past.
 */

const BAND_LABEL: Record<string, string> = {
  excellence: "Excelência",
  quality: "Qualidade",
  improvement: "Aperfeiçoamento",
  critical: "Crítica",
};

const BAND_TONE: Record<string, string> = {
  excellence: "text-severity-success",
  quality: "text-primary",
  improvement: "text-muted-foreground",
  critical: "text-severity-critical",
};

function NumberInput({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <input
      type="number"
      aria-label={label}
      min={min}
      max={max}
      value={value}
      onChange={(event) => onChange(Number(event.target.value))}
      className="w-20 rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground"
    />
  );
}

export function NpsParametrosTab() {
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

  const bands = bandsOf(draft);
  const ordered = npsBandsAreOrdered(bands);
  const dirty =
    settingsQuery.data !== undefined &&
    JSON.stringify(draft) !== JSON.stringify(settingsQuery.data);

  const handleSave = () => {
    // The DB carries the same CHECK. Refusing here as well turns a 23514 into a
    // sentence someone can act on, instead of a constraint name.
    if (!ordered) {
      toast.error("As faixas precisam ser decrescentes: excelência > qualidade > aperfeiçoamento.");
      return;
    }
    save.mutate(draft, {
      onSuccess: () => toast.success("Parâmetros salvos."),
      onError: () => toast.error("Não foi possível salvar os parâmetros."),
    });
  };

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[1.35fr_1fr]">
      <div className="flex flex-col gap-4">
        <NpsCard
          title="Meta e faixas"
          icon="lucide:target"
          iconTone="primary"
          sub="como o score é lido no painel"
        >
          <NpsConfigRow
            label="Meta interna de NPS"
            help="linha tracejada do gráfico de tendência; pinta o score de verde quando atingida"
          >
            <div className="flex items-center gap-3">
              <input
                type="range"
                aria-label="Meta interna de NPS"
                min={0}
                max={100}
                step={5}
                value={draft.targetScore}
                onChange={(event) => patch({ targetScore: Number(event.target.value) })}
                className="w-36 accent-primary"
              />
              <span className="w-9 text-right font-display text-[22px] font-bold text-primary">
                {draft.targetScore}
              </span>
            </div>
          </NpsConfigRow>

          <div className="pt-4">
            <div className="mb-3 text-[10.5px] font-bold uppercase tracking-[0.13em] text-muted-foreground">
              Faixas de classificação
            </div>

            <NpsRuler score={draft.targetScore} />

            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {npsBandRanges(bands).map((range) => (
                <div key={range.band} className="rounded-lg bg-muted/40 px-2.5 py-2.5">
                  <div
                    className={`font-display text-[10.5px] font-bold uppercase italic tracking-[0.05em] ${BAND_TONE[range.band]}`}
                  >
                    {BAND_LABEL[range.band]}
                  </div>
                  <div className="mt-1 text-[12.5px] font-semibold text-card-foreground">
                    {range.min} a {range.max}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
                Excelência a partir de
                <NumberInput
                  label="Corte de excelência"
                  value={draft.bandExcellence}
                  min={-99}
                  max={100}
                  onChange={(value) => patch({ bandExcellence: value })}
                />
              </label>
              <label className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
                Qualidade a partir de
                <NumberInput
                  label="Corte de qualidade"
                  value={draft.bandQuality}
                  min={-99}
                  max={100}
                  onChange={(value) => patch({ bandQuality: value })}
                />
              </label>
              <label className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
                Aperfeiçoamento a partir de
                <NumberInput
                  label="Corte de aperfeiçoamento"
                  value={draft.bandImprovement}
                  min={-100}
                  max={99}
                  onChange={(value) => patch({ bandImprovement: value })}
                />
              </label>
            </div>

            {!ordered ? (
              <p className="mt-3 flex items-start gap-2 text-[12.5px] font-semibold text-severity-critical">
                <Icon icon="lucide:circle-alert" size={15} className="mt-0.5 shrink-0" />
                Fora de ordem: com estes cortes uma das faixas fica inalcançável e a régua deixa de
                descrever a realidade.
              </p>
            ) : null}
          </div>
        </NpsCard>

        <NpsCard
          title="Tratativa de detratores"
          icon="lucide:life-buoy"
          iconTone="critical"
          sub="o que abre a fila de recuperação"
        >
          <NpsConfigRow
            label="Nota que abre tratativa"
            help="0–6 é o corte padrão do NPS; incluir 7–8 também abre a fila para neutros"
          >
            <NpsSeg
              ariaLabel="Nota que abre tratativa"
              items={[
                { value: 6 as const, label: "0–6" },
                { value: 8 as const, label: "0–8" },
              ]}
              value={draft.recoveryThreshold}
              onChange={(value) => patch({ recoveryThreshold: value })}
            />
          </NpsConfigRow>

          <NpsConfigRow label="Prazo de primeiro contato" help="SLA do card na coluna “Novo”">
            <NpsSeg
              ariaLabel="Prazo de primeiro contato"
              items={[
                { value: 4, label: "4h" },
                { value: 24, label: "24h" },
                { value: 48, label: "48h" },
              ]}
              value={draft.recoverySlaHours}
              onChange={(value) => patch({ recoverySlaHours: value })}
            />
          </NpsConfigRow>

          <NpsConfigRow
            label="Responsável pelo contato"
            help="quem recebe a tratativa quando a nota chega"
            note="Ainda sem efeito: a tratativa fica com quem clicar em “Iniciar contato”, independente desta escolha."
          >
            <NpsSeg
              ariaLabel="Responsável pelo contato"
              items={[
                { value: "attendant" as const, label: "Atendente" },
                { value: "manager" as const, label: "Gestor da loja" },
              ]}
              value={draft.recoveryOwner}
              onChange={(value) => patch({ recoveryOwner: value })}
            />
          </NpsConfigRow>

          <NpsConfigRow
            label="Escalonar quando vencer"
            help="tratativa fora do prazo avisa o gestor da loja"
            note="Ainda não notifica: a fila marca o vencimento, mas nada dispara aviso."
          >
            <NpsToggle
              label="Escalonar quando vencer"
              checked={draft.recoveryEscalate}
              onChange={(value) => patch({ recoveryEscalate: value })}
            />
          </NpsConfigRow>
        </NpsCard>
      </div>

      <div className="flex flex-col gap-4">
        <NpsCard title="Visibilidade" icon="lucide:eye" sub="onde o NPS aparece para a equipe">
          <NpsConfigRow label="Card no Cockpit" help="score da janela no painel de início">
            <NpsToggle
              label="Card no Cockpit"
              checked={draft.showWidget}
              onChange={(value) => patch({ showWidget: value })}
            />
          </NpsConfigRow>
          <NpsConfigRow label="Selo na ficha do cliente" help="última nota e data ao lado do nome">
            <NpsToggle
              label="Selo na ficha do cliente"
              checked={draft.showOnFiche}
              onChange={(value) => patch({ showOnFiche: value })}
            />
          </NpsConfigRow>
          <NpsConfigRow
            label="NPS entra no ranking"
            help="compõe a pontuação do atendente ao lado das vendas"
            note="Ainda sem efeito: o Ranking não lê o NPS. Desligado por padrão também por escolha — o PRD-148B recusava expor NPS por atendente, e ligar isto muda o que o time otimiza."
          >
            <NpsToggle
              label="NPS entra no ranking"
              checked={draft.includeInRanking}
              onChange={(value) => patch({ includeInRanking: value })}
            />
          </NpsConfigRow>
          <NpsConfigRow
            label="Respostas anônimas para a equipe"
            help="atendente vê nota e comentário sem o nome do cliente; gestor vê tudo"
            note="Ainda não aplicado na leitura — a aba Respostas mostra o nome para quem pode ver a pesquisa."
          >
            <NpsToggle
              label="Respostas anônimas para a equipe"
              checked={draft.anonymousForTeam}
              onChange={(value) => patch({ anonymousForTeam: value })}
            />
          </NpsConfigRow>
        </NpsCard>

        <NpsCard title="Cálculo" icon="lucide:calculator">
          <NpsFactRow label="Fórmula" value="% promotores − % detratores" />
          <NpsFactRow label="Promotor" value="nota 9 ou 10" />
          <NpsFactRow label="Neutro" value="nota 7 ou 8" />
          <NpsFactRow label="Detrator" value="nota 0 a 6" />
          <NpsFactRow label="Janela padrão do painel" value={`${draft.windowDays} dias`} />
          <NpsFactRow
            label="Respostas mínimas para exibir"
            value={`${draft.minResponsesForScore}`}
          />
          <p className="mt-3 text-xs text-muted-foreground">
            O score é sempre derivado das contagens do período filtrado — nunca digitado. Abaixo do
            mínimo, nenhuma tela mostra número: só “Coletando dados”.
          </p>
        </NpsCard>

        <NpsNotWired>
          As <b>quatro linhas marcadas</b> acima gravam a preferência mas ainda não têm
          comportamento ligado. Ficam visíveis para não sumir da tela o que o kit pede — e marcadas
          para não passar por pronto. Todo o resto desta aba tem efeito imediato: meta, faixas,
          corte da tratativa, prazo, card no Cockpit e selo na ficha.
        </NpsNotWired>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!dirty || save.isPending}
            onClick={handleSave}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2.5 text-[13.5px] font-bold text-primary-foreground disabled:opacity-50"
          >
            <Icon icon="lucide:check" size={15} />
            {save.isPending ? "Salvando…" : "Salvar parâmetros"}
          </button>
          <button
            type="button"
            onClick={() => patch({ ...NPS_READING_DEFAULTS })}
            className="rounded-lg border border-border px-4 py-2.5 text-[13.5px] font-bold text-muted-foreground hover:bg-muted"
          >
            Restaurar padrão
          </button>
        </div>
      </div>
    </div>
  );
}
