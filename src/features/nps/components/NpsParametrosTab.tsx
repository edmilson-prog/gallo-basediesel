import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Switch } from "@/components/ui/switch";
import { Icon } from "@/components/Icon";
import { useCurrentStore } from "@/features/multistore";
import { usePermission } from "@/features/rbac/hooks/usePermission";
import { useNpsProvider } from "@/providers/data";
import type { INpsFollowupOwner } from "@/shared/types";
import type { INpsBand, INpsBandThresholds, INpsParameters } from "../engine";
import {
  NPS_BAND_LABEL,
  NPS_FOLLOWUP_CUTOFFS,
  NPS_PARAMETER_DEFAULTS,
  npsBand,
  npsBandLabel,
  npsBandRanges,
  npsBandsAreOrdered,
  rulerPosition,
  toNpsParameters,
} from "../engine";

/**
 * "Parâmetros" tab of /app/nps, from `ui_kits/nps`.
 *
 * This tab configures how the number is *read*, never how it is *sent*. The
 * sending rules — triggers, delay, cooldown, sampling and the two anti-blast
 * backstops — stay in Configurações → NPS, and the two screens share no field:
 * a mistake here can make the panel judge a score wrongly, but it can never
 * make a message leave.
 *
 * The kit hard-codes its palette (#E0BB4E, #5BB07A, #E23A40); those become
 * semantic tokens here, as in `NpsPanelParts`, because a component that names a
 * hex cannot follow the theme.
 *
 * `Card` and `Seg` are re-declared locally rather than imported: the panel page
 * keeps private copies of both, and this tab is meant to drop into it without
 * touching it. Once the tab is wired in, the three can collapse into one.
 */

const SETTINGS_QUERY_KEY = "settings";

/** Full class names, never interpolated — Tailwind only generates what it can read. */
const BAND_TONE: Record<INpsBand, { dot: string; text: string }> = {
  excellence: { dot: "bg-severity-success", text: "text-severity-success" },
  quality: { dot: "bg-primary", text: "text-primary" },
  improvement: { dot: "bg-severity-warning", text: "text-severity-warning" },
  critical: { dot: "bg-severity-critical", text: "text-severity-critical" },
};

const FOLLOWUP_OWNERS: ReadonlyArray<{ value: INpsFollowupOwner; label: string; help: string }> = [
  {
    value: "attendant",
    label: "Atendente da conversa",
    help: "Quem falou com o cliente é quem retorna. Mais rápido, e o contexto já está na cabeça de quem liga.",
  },
  {
    value: "manager",
    label: "Gestor da loja",
    help: "Centraliza a tratativa. Mais lento, mas tira o retorno das mãos de quem pode ter causado a nota.",
  },
  {
    value: "owner",
    label: "Dono da carteira",
    help: "O vendedor responsável pelo cliente, mesmo que outra pessoa tenha atendido daquela vez.",
  },
];

const HELP = {
  target:
    "Onde o gráfico de tendência desenha a linha tracejada, e a partir de quanto um corte aparece como atingido. É uma meta interna — não muda o cálculo do NPS.",
  bands:
    "Nomeiam o score para quem não trabalha com NPS todo dia: 48 e 52 se parecem, mas caem em lados opostos de uma linha que a empresa leva a sério.",
  bandsOrder: "Cada faixa começa onde a de baixo termina. Os limites precisam ser decrescentes.",
  cutoff:
    "Quais respostas abrem uma tratativa. Incluir os neutros multiplica a fila — só faz sentido se houver gente para atender.",
  sla: "Prazo para o primeiro contato depois que a resposta chega. É o que separa uma tratativa de um arquivo de reclamações.",
  owner: "Quem fica responsável por fazer esse primeiro contato.",
  escalation:
    "Se o prazo estourar sem contato, a tratativa sobe para o gestor. Sem isso, o SLA é uma intenção.",
  cockpit: "Card de NPS no Cockpit executivo.",
  customerBadge: "Selo com a última nota do cliente, na ficha dele.",
  ranking:
    "Tabela de NPS por atendente no painel. Desligue se a leitura na sua equipe for de ranking, e não de diagnóstico.",
  anonymize:
    "Oculta o nome de quem respondeu nas listas de leitura. A tratativa continua enxergando o contato — sem isso não haveria a quem retornar.",
} as const;

/** Card in the panel's style — header strip, then body. */
function Card({
  title,
  icon,
  sub,
  children,
}: {
  title: string;
  icon: string;
  sub?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Icon icon={icon} className="text-muted-foreground" size={16} />
        <span className="text-[13px] font-bold text-card-foreground">{title}</span>
        {sub ? <span className="text-xs text-muted-foreground">{sub}</span> : null}
      </div>
      <div className="flex flex-col gap-5 p-4">{children}</div>
    </section>
  );
}

/** Segmented control — the kit's `NpsSeg`. */
function Seg<T extends string | number>({
  items,
  value,
  disabled,
  onChange,
}: {
  items: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  disabled?: boolean;
  onChange: (value: T) => void;
}) {
  return (
    <div className="inline-flex flex-wrap gap-0.5 rounded-lg border border-border bg-muted/40 p-0.5">
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={String(item.value)}
            type="button"
            disabled={disabled}
            aria-pressed={active}
            onClick={() => onChange(item.value)}
            className={`rounded-md px-3 py-1.5 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
              active
                ? "bg-primary font-bold text-primary-foreground"
                : "font-semibold text-muted-foreground hover:text-foreground"
            }`}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Number input that tolerates being typed in.
 *
 * The committed value stays a number, but the field keeps its own string while
 * the user edits: "" and "-" are legal mid-typing states, and clamping on every
 * keystroke would fight the cursor (typing "-40" would snap to "-4" and back).
 * The value is clamped on blur instead, and the save is validated anyway.
 */
function NumberField({
  label,
  help,
  value,
  min,
  max,
  suffix,
  disabled,
  onChange,
}: {
  label: string;
  help?: string;
  value: number;
  min: number;
  max: number;
  suffix?: string;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  const [buffer, setBuffer] = useState(String(value));

  // Re-sync when the value changes from the outside: load, reset to defaults.
  useEffect(() => {
    setBuffer(String(value));
  }, [value]);

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[13px] font-semibold text-card-foreground">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="number"
          inputMode="numeric"
          value={buffer}
          min={min}
          max={max}
          disabled={disabled}
          onChange={(event) => {
            const raw = event.target.value;
            setBuffer(raw);
            const parsed = Number.parseInt(raw, 10);
            if (!Number.isNaN(parsed)) onChange(parsed);
          }}
          onBlur={() => {
            const clamped = Math.max(min, Math.min(max, value));
            if (clamped !== value) onChange(clamped);
            setBuffer(String(clamped));
          }}
          className="w-24 rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground disabled:cursor-not-allowed disabled:opacity-60"
        />
        {suffix ? <span className="text-xs text-muted-foreground">{suffix}</span> : null}
      </div>
      {help ? <p className="max-w-prose text-xs text-muted-foreground">{help}</p> : null}
    </div>
  );
}

/** Toggle row — label and reason on the left, switch on the right. */
function ToggleRow({
  label,
  help,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  help: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border pb-4 last:border-0 last:pb-0">
      <div className="min-w-0">
        <p className="text-[13px] font-semibold text-card-foreground">{label}</p>
        <p className="mt-0.5 max-w-prose text-xs text-muted-foreground">{help}</p>
      </div>
      <Switch checked={checked} disabled={disabled} onCheckedChange={onChange} />
    </div>
  );
}

/** Compact −100..100 track with a marker where the target sits. */
function TargetRuler({ target }: { target: number }) {
  return (
    <div className="max-w-md">
      <div className="h-1.5 overflow-hidden rounded bg-gradient-to-r from-severity-critical via-severity-warning to-severity-success opacity-60" />
      <div className="relative h-0">
        <div
          className="absolute -top-[13px] h-[19px] w-0.5 bg-foreground"
          style={{ left: `${rulerPosition(target)}%`, transform: "translateX(-1px)" }}
        />
      </div>
      <div className="mt-2.5 flex justify-between font-display text-[10.5px] font-bold uppercase tracking-[0.08em] text-muted-foreground/70">
        <span>−100</span>
        <span>0</span>
        <span>100</span>
      </div>
    </div>
  );
}

/** The one card that is not a form: the arithmetic is not ours to change. */
function CalculationCard({ minResponses }: { minResponses: number | null }) {
  const classes = [
    { label: "Detrator", range: "0 a 6", tone: "text-severity-critical" },
    { label: "Neutro", range: "7 a 8", tone: "text-muted-foreground" },
    { label: "Promotor", range: "9 a 10", tone: "text-severity-success" },
  ];

  return (
    <Card title="Como o NPS é calculado" icon="mdi:function-variant" sub="fixo">
      <div className="grid gap-2.5 sm:grid-cols-3">
        {classes.map((item) => (
          <div key={item.label} className="rounded-lg bg-muted/40 px-3 py-2.5">
            <div className={`font-display text-[10.5px] font-bold uppercase italic ${item.tone}`}>
              {item.label}
            </div>
            <div className="mt-1 font-display text-[19px] font-bold text-card-foreground">
              {item.range}
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-border px-4 py-3">
        <p className="font-display text-[15px] font-bold text-card-foreground">
          NPS = % de promotores − % de detratores
        </p>
        <p className="mt-1.5 max-w-prose text-xs text-muted-foreground">
          Arredondado, sobre as respostas da janela. Os neutros entram no total, mas não movem o
          score — essa assimetria é o ponto da métrica, e é por isso que 20 neutros não salvam um
          mês ruim.
        </p>
      </div>

      <p className="max-w-prose text-xs text-muted-foreground">
        A classe nunca é gravada: ela sai sempre da nota. Mudar a régua no futuro não deixa
        respostas antigas discordando da regra atual.
      </p>

      <p className="max-w-prose text-xs text-muted-foreground">
        {minResponses === null
          ? "Abaixo do mínimo de respostas, nenhuma tela mostra número — só “Coletando dados”."
          : `Abaixo de ${minResponses} ${minResponses === 1 ? "resposta" : "respostas"} na janela, nenhuma tela mostra número — só “Coletando dados”.`}{" "}
        Esse mínimo, os gatilhos e as travas de envio ficam em{" "}
        <Link to="/app/configuracoes/nps" className="font-semibold text-primary hover:underline">
          Configurações → NPS
        </Link>
        .
      </p>
    </Card>
  );
}

const PARAMETER_KEYS = Object.keys(NPS_PARAMETER_DEFAULTS) as Array<keyof INpsParameters>;

function hasChanges(draft: INpsParameters, baseline: INpsParameters): boolean {
  return PARAMETER_KEYS.some((key) => draft[key] !== baseline[key]);
}

export function NpsParametrosTab() {
  const provider = useNpsProvider();
  const queryClient = useQueryClient();
  const { currentStore } = useCurrentStore();
  const storeId = currentStore?.id ?? "";
  const canEdit = usePermission("settings_nps", "edit");

  const settingsQuery = useQuery({
    // Id only in the key — never the store object, which is a new reference on
    // every render and would quietly defeat the cache.
    queryKey: ["nps", SETTINGS_QUERY_KEY, storeId],
    queryFn: () => provider.getSettings(storeId),
    enabled: storeId !== "",
  });

  const settings = settingsQuery.data ?? null;

  // A store with no row yet is the normal starting state: the defaults are what
  // every surface already assumes, so the tab shows them rather than an error.
  const baseline = useMemo<INpsParameters>(
    () => (settings ? toNpsParameters(settings) : NPS_PARAMETER_DEFAULTS),
    [settings],
  );

  const [draft, setDraft] = useState<INpsParameters>(baseline);

  useEffect(() => {
    setDraft(baseline);
  }, [baseline]);

  const patch = (changes: Partial<INpsParameters>) =>
    setDraft((current) => ({ ...current, ...changes }));

  const bands: INpsBandThresholds = {
    excellence: draft.bandExcellenceMin,
    quality: draft.bandQualityMin,
    improvement: draft.bandImprovementMin,
  };
  const bandsOrdered = npsBandsAreOrdered(bands);
  const dirty = hasChanges(draft, baseline);

  const save = useMutation({
    mutationFn: () => provider.updateSettings(storeId, draft),
    onSuccess: (saved) => {
      queryClient.setQueryData(["nps", SETTINGS_QUERY_KEY, storeId], saved);
      toast.success("Parâmetros do NPS salvos.");
    },
    onError: () => toast.error("Não foi possível salvar os parâmetros."),
  });

  const handleSave = () => {
    if (!bandsOrdered) {
      toast.error(HELP.bandsOrder);
      return;
    }
    save.mutate();
  };

  if (!storeId) {
    return (
      <p className="p-6 text-sm text-muted-foreground">
        Selecione uma loja para ver os parâmetros do NPS.
      </p>
    );
  }

  if (settingsQuery.isLoading) {
    return <p className="p-6 text-sm text-muted-foreground">Carregando…</p>;
  }

  if (settingsQuery.isError) {
    return (
      <p className="p-6 text-sm text-severity-critical">
        Não foi possível carregar os parâmetros do NPS.
      </p>
    );
  }

  const disabled = !canEdit || save.isPending;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-xl font-extrabold uppercase leading-none text-foreground">
            Parâmetros
          </h2>
          <p className="mt-1 max-w-prose text-[13px] text-muted-foreground">
            Como a nota é lida, quem cuida das notas baixas e onde o NPS aparece. Nada aqui envia
            pesquisa.
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {dirty ? (
            <span className="text-xs text-muted-foreground">Alterações não salvas</span>
          ) : null}
          <button
            type="button"
            onClick={() => setDraft(NPS_PARAMETER_DEFAULTS)}
            disabled={disabled}
            className="rounded-lg border border-border px-3 py-1.5 text-sm text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
          >
            Restaurar padrão
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={disabled || !dirty}
            className="rounded-lg bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
          >
            {save.isPending ? "Salvando…" : "Salvar parâmetros"}
          </button>
        </div>
      </div>

      {!canEdit ? (
        <p className="rounded-lg border border-border bg-muted/40 px-4 py-2.5 text-xs text-muted-foreground">
          Você pode consultar os parâmetros, mas não alterá-los. A edição é do Owner.
        </p>
      ) : null}

      <Card title="Meta interna" icon="mdi:target" sub={`${draft.targetScore} pontos`}>
        <div className="flex flex-wrap items-end gap-8">
          <NumberField
            label="Meta"
            value={draft.targetScore}
            min={-100}
            max={100}
            suffix="pontos"
            disabled={disabled}
            onChange={(targetScore) => patch({ targetScore })}
          />
          <div className="min-w-0 flex-1">
            <TargetRuler target={draft.targetScore} />
          </div>
        </div>
        <p className="max-w-prose text-xs text-muted-foreground">{HELP.target}</p>
        <p className="text-xs text-muted-foreground">
          Com as faixas atuais, a meta cai em{" "}
          <b
            className={BAND_TONE[bandsOrdered ? npsBand(draft.targetScore, bands) : "quality"].text}
          >
            {bandsOrdered ? npsBandLabel(draft.targetScore, bands) : "—"}
          </b>
          .
        </p>
      </Card>

      <Card title="Faixas de classificação" icon="mdi:tune-variant">
        <p className="max-w-prose text-xs text-muted-foreground">{HELP.bands}</p>

        <div className="flex flex-col">
          {npsBandRanges(bands).map((range) => {
            const editable = range.band !== "critical";
            const tone = BAND_TONE[range.band];
            return (
              <div
                key={range.band}
                className="flex flex-wrap items-center gap-4 border-b border-border py-3 last:border-0"
              >
                <span className="flex min-w-40 items-center gap-2">
                  <span className={`size-2 shrink-0 rounded-[2px] ${tone.dot}`} />
                  <span className="text-[13px] font-bold text-card-foreground">
                    {NPS_BAND_LABEL[range.band]}
                  </span>
                </span>

                {editable ? (
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    a partir de
                    <input
                      type="number"
                      inputMode="numeric"
                      value={
                        range.band === "excellence"
                          ? draft.bandExcellenceMin
                          : range.band === "quality"
                            ? draft.bandQualityMin
                            : draft.bandImprovementMin
                      }
                      min={-100}
                      max={100}
                      disabled={disabled}
                      onChange={(event) => {
                        const parsed = Number.parseInt(event.target.value, 10);
                        if (Number.isNaN(parsed)) return;
                        const next = Math.max(-100, Math.min(100, parsed));
                        if (range.band === "excellence") patch({ bandExcellenceMin: next });
                        else if (range.band === "quality") patch({ bandQualityMin: next });
                        else patch({ bandImprovementMin: next });
                      }}
                      className="w-20 rounded-lg border border-border bg-background px-2.5 py-1 text-sm text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                    />
                  </label>
                ) : (
                  <span className="text-xs text-muted-foreground">o que sobrar abaixo</span>
                )}

                <span
                  className={`ml-auto font-display text-[13px] font-bold uppercase tracking-[0.06em] ${tone.text}`}
                >
                  {range.max >= range.min ? `${range.min} a ${range.max}` : "faixa vazia"}
                </span>
              </div>
            );
          })}
        </div>

        {!bandsOrdered ? (
          <p className="rounded-lg border border-severity-critical/40 bg-severity-critical/10 px-3 py-2 text-xs text-severity-critical">
            {HELP.bandsOrder}
          </p>
        ) : null}
      </Card>

      <Card title="Tratativa" icon="mdi:lifebuoy" sub="o que fazer com uma nota baixa">
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold text-card-foreground">Nota de corte</span>
          <Seg
            items={NPS_FOLLOWUP_CUTOFFS.map((cutoff) => ({
              value: cutoff,
              label: cutoff === 6 ? "0 a 6 · só detratores" : "0 a 8 · detratores e neutros",
            }))}
            value={draft.followupMaxScore}
            disabled={disabled}
            onChange={(followupMaxScore) => patch({ followupMaxScore })}
          />
          <p className="max-w-prose text-xs text-muted-foreground">{HELP.cutoff}</p>
        </div>

        <NumberField
          label="SLA de primeiro contato"
          help={HELP.sla}
          value={draft.followupSlaHours}
          min={1}
          max={168}
          suffix="horas"
          disabled={disabled}
          onChange={(followupSlaHours) => patch({ followupSlaHours })}
        />

        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold text-card-foreground">Responsável</span>
          <Seg
            items={FOLLOWUP_OWNERS.map((owner) => ({ value: owner.value, label: owner.label }))}
            value={draft.followupOwner}
            disabled={disabled}
            onChange={(followupOwner) => patch({ followupOwner })}
          />
          <p className="max-w-prose text-xs text-muted-foreground">
            {FOLLOWUP_OWNERS.find((owner) => owner.value === draft.followupOwner)?.help ??
              HELP.owner}
          </p>
        </div>

        <div className="flex flex-col gap-3 rounded-lg border border-border p-3.5">
          <ToggleRow
            label="Escalonar quando o SLA estourar"
            help={HELP.escalation}
            checked={draft.followupEscalationEnabled}
            disabled={disabled}
            onChange={(followupEscalationEnabled) => patch({ followupEscalationEnabled })}
          />
          {draft.followupEscalationEnabled ? (
            <NumberField
              label="Escalonar depois de"
              value={draft.followupEscalationHours}
              min={1}
              max={336}
              suffix="horas além do SLA"
              disabled={disabled}
              onChange={(followupEscalationHours) => patch({ followupEscalationHours })}
            />
          ) : null}
        </div>
      </Card>

      <Card title="Visibilidade" icon="mdi:eye-outline" sub="onde o NPS aparece">
        <ToggleRow
          label="Card no Cockpit"
          help={HELP.cockpit}
          checked={draft.showCockpitCard}
          disabled={disabled}
          onChange={(showCockpitCard) => patch({ showCockpitCard })}
        />
        <ToggleRow
          label="Selo na ficha do cliente"
          help={HELP.customerBadge}
          checked={draft.showCustomerBadge}
          disabled={disabled}
          onChange={(showCustomerBadge) => patch({ showCustomerBadge })}
        />
        <ToggleRow
          label="Ranking por atendente"
          help={HELP.ranking}
          checked={draft.showSellerRanking}
          disabled={disabled}
          onChange={(showSellerRanking) => patch({ showSellerRanking })}
        />
        <ToggleRow
          label="Respostas anônimas"
          help={HELP.anonymize}
          checked={draft.anonymizeResponses}
          disabled={disabled}
          onChange={(anonymizeResponses) => patch({ anonymizeResponses })}
        />
      </Card>

      <CalculationCard minResponses={settings?.minResponsesForScore ?? null} />
    </div>
  );
}
