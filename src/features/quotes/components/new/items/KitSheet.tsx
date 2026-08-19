// src/features/quotes/components/new/items/KitSheet.tsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { ID, IPart, IVehicleModelKit } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { buildKitPreview, type IKitPreviewLine } from "@/features/model-kits/utils/kitPreview";
import type { IApplyKitSelection } from "@/features/model-kits";
import { usePermission } from "@/features/rbac/hooks/usePermission";
import type { IRankedKit } from "../../../utils/kitRanking";

const moneyFormatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** checkbox | Peça | Preço unit. | Qtd | Subtotal */
const KIT_ROW = "grid-cols-[1rem_minmax(0,1fr)_5.5rem_5.5rem_6rem]";

const FALLBACK_CATEGORY_ICON = "mdi:package-variant-closed";

const CATEGORY_ICON: Record<string, string> = {
  filtros: "mdi:air-filter",
  freios: "mdi:car-brake-alert",
  correia: "mdi:fan",
  revisao: "mdi:wrench-outline",
  custom: FALLBACK_CATEGORY_ICON,
};

const CATEGORY_LABEL: Record<string, string> = {
  filtros: "filtros",
  freios: "freios",
  correia: "correia",
  revisao: "revisão",
  custom: "custom",
};

function hasPrice(part: IPart): boolean {
  return typeof part.unitPrice === "number" && part.unitPrice > 0;
}

interface ILineState {
  checked: boolean;
  quantity: number;
}

function initialStates(lines: IKitPreviewLine[]): ILineState[] {
  return lines.map((l) => ({ checked: !l.isOptional, quantity: l.defaultQuantity }));
}

export interface IKitSheetProps {
  /** Store kits, already ranked by the customer's fleet. */
  ranked: IRankedKit[];
  /** Kit to open on mount; null opens the first of the list. */
  initialKitId: ID | null;
  partsById: Map<ID, IPart>;
  /** Quantity already in the quote, per partId. */
  inQuoteQtyByPart: Map<string, number>;
  onApply: (kit: IVehicleModelKit, selection: IApplyKitSelection[]) => void;
  onClose: () => void;
  loading?: boolean;
}

/**
 * Kits as a sheet inside the items card: the list on the left, the chosen kit's
 * preview on the right — one surface to decide on, instead of a popover that
 * opens a modal. Base items come checked, optionals come as suggestions.
 */
export function KitSheet({
  ranked,
  initialKitId,
  partsById,
  inQuoteQtyByPart,
  onApply,
  onClose,
  loading = false,
}: IKitSheetProps) {
  const [selectedId, setSelectedId] = useState<ID | null>(
    initialKitId ?? ranked[0]?.kit.id ?? null,
  );

  // Escape closes the sheet, matching the dialog it replaces.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const selected = ranked.find((r) => r.kit.id === selectedId) ?? ranked[0] ?? null;
  const kit = selected?.kit ?? null;

  const preview = useMemo(() => (kit ? buildKitPreview(kit, partsById) : null), [kit, partsById]);

  const [states, setStates] = useState<ILineState[]>(() =>
    preview ? initialStates(preview.lines) : [],
  );
  useEffect(() => {
    setStates(preview ? initialStates(preview.lines) : []);
  }, [preview]);

  if (loading) {
    return (
      <SheetFrame onClose={onClose}>
        <p className="flex items-center gap-1.5 p-4 text-xs text-muted-foreground">
          <Icon icon="mdi:loading" size={13} className="animate-spin motion-reduce:animate-none" />
          Carregando kits…
        </p>
      </SheetFrame>
    );
  }

  if (ranked.length === 0 || !kit || !preview) {
    return (
      <SheetFrame onClose={onClose}>
        <EmptyKits />
      </SheetFrame>
    );
  }

  const lines = preview.lines;
  const firstOptional = lines.findIndex((l) => l.isOptional);
  const marked = states.filter((s) => s?.checked).length;
  const noPriceMarked = lines.filter((l, i) => states[i]?.checked && !hasPrice(l.part)).length;
  const estimated = lines.reduce((sum, l, i) => {
    const s = states[i];
    if (!s?.checked || !hasPrice(l.part)) return sum;
    return sum + l.part.unitPrice * s.quantity;
  }, 0);
  const allOptionalsOn =
    firstOptional >= 0 && lines.every((l, i) => !l.isOptional || states[i]?.checked);

  const setAllOptionals = (on: boolean) =>
    setStates((prev) => prev.map((s, i) => (lines[i]?.isOptional ? { ...s, checked: on } : s)));

  const apply = () => {
    const selection: IApplyKitSelection[] = lines
      .map((line, i) => ({ line, state: states[i] }))
      .filter(({ state }) => state?.checked)
      .map(({ line, state }) => ({
        part: line.part,
        quantity: state?.quantity ?? line.defaultQuantity,
      }));
    onApply(kit, selection);
  };

  return (
    <SheetFrame onClose={onClose}>
      <div className="grid grid-cols-1 md:grid-cols-[14.5rem_minmax(0,1fr)]">
        <ul className="max-h-52 overflow-y-auto border-b border-border md:max-h-80 md:border-b-0 md:border-r">
          {ranked.map(({ kit: k, matchedVehicleIndex }) => {
            const active = k.id === kit.id;
            return (
              <li key={k.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(k.id)}
                  aria-current={active}
                  className={`flex w-full flex-col gap-1 border-b border-l-2 border-border px-3 py-2 text-left transition-colors motion-reduce:transition-none ${
                    active
                      ? "border-l-primary bg-muted/60"
                      : "border-l-transparent hover:bg-muted/30"
                  }`}
                >
                  <span className="truncate text-xs font-medium text-foreground">{k.name}</span>
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="inline-flex items-center gap-1 font-semicond text-[11px] text-muted-foreground">
                      <Icon icon={CATEGORY_ICON[k.category] ?? FALLBACK_CATEGORY_ICON} size={11} />
                      {CATEGORY_LABEL[k.category] ?? k.category} · {k.items.length}{" "}
                      {k.items.length === 1 ? "peça" : "peças"}
                    </span>
                    {k.status === "rascunho" && (
                      <span className="rounded border border-border px-1 text-[10px] uppercase text-muted-foreground">
                        rascunho
                      </span>
                    )}
                    {matchedVehicleIndex >= 0 && (
                      <span className="rounded border border-info/40 bg-info/10 px-1 text-[10px] uppercase text-info">
                        no veículo
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        <div className="flex min-w-0 flex-col">
          <div className="flex flex-wrap items-center gap-2 px-3 pt-2.5">
            <span className="text-[13px] font-semibold text-foreground">{kit.name}</span>
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                kit.status === "oficial"
                  ? "border border-primary/30 bg-primary/10 text-primary"
                  : "border border-border text-muted-foreground"
              }`}
            >
              {kit.status}
            </span>
            <span className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
              <Icon icon={CATEGORY_ICON[kit.category] ?? FALLBACK_CATEGORY_ICON} size={11} />
              {CATEGORY_LABEL[kit.category] ?? kit.category}
            </span>
          </div>

          <div className="max-h-64 min-h-0 flex-1 overflow-y-auto px-3 pb-2.5 pt-1.5">
            <div
              className={`grid ${KIT_ROW} items-center gap-2 px-0.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground`}
            >
              <span className="sr-only">Incluir</span>
              <span>Peça</span>
              <span className="text-right">Preço unit.</span>
              <span className="text-center">Qtd</span>
              <span className="text-right">Subtotal</span>
            </div>

            {lines.map((line, i) => {
              const state = states[i];
              if (!state) return null;
              const row = (
                <KitLine
                  key={line.part.id}
                  line={line}
                  state={state}
                  alreadyInQuote={inQuoteQtyByPart.get(line.part.id) ?? 0}
                  onToggle={(checked) =>
                    setStates((prev) => prev.map((s, j) => (j === i ? { ...s, checked } : s)))
                  }
                  onQuantity={(quantity) =>
                    setStates((prev) =>
                      prev.map((s, j) => (j === i ? { ...s, quantity: Math.max(1, quantity) } : s)),
                    )
                  }
                />
              );
              if (firstOptional >= 0 && i === firstOptional) {
                return (
                  <div key={`optional-${line.part.id}`}>
                    <div className="my-1.5 flex items-center gap-2">
                      <span className="h-px flex-1 bg-border" />
                      <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        opcionais (sugestões)
                      </span>
                      <button
                        type="button"
                        onClick={() => setAllOptionals(!allOptionalsOn)}
                        className="shrink-0 text-[11px] font-medium text-info hover:underline"
                      >
                        {allOptionalsOn ? "desmarcar todos" : "marcar todos"}
                      </button>
                      <span className="h-px flex-1 bg-border" />
                    </div>
                    {row}
                  </div>
                );
              }
              return row;
            })}

            <div className="mt-2 flex flex-col gap-0.5">
              {preview.missing > 0 && (
                <span className="inline-flex items-center gap-1.5 text-[11px] text-severity-warning">
                  <Icon icon="mdi:alert-circle-outline" size={12} />
                  {preview.missing}{" "}
                  {preview.missing === 1 ? "peça não encontrada" : "peças não encontradas"} no
                  catálogo e {preview.missing === 1 ? "foi omitida" : "foram omitidas"}.
                </span>
              )}
              {noPriceMarked > 0 && (
                <span className="text-[11px] text-muted-foreground">
                  {noPriceMarked}{" "}
                  {noPriceMarked === 1 ? "item marcado sem preço" : "itens marcados sem preço"} — o
                  subtotal não {noPriceMarked === 1 ? "o" : "os"} inclui.
                </span>
              )}
              <span className="font-semicond text-[11px] text-muted-foreground">
                preços do catálogo de hoje
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border bg-muted/20 px-3 py-2">
            <span className="text-xs text-muted-foreground">
              {marked} de {lines.length} itens
            </span>
            <span
              className="font-display text-[19px] font-extrabold tabular-nums text-foreground"
              aria-live="polite"
              aria-atomic="true"
            >
              {moneyFormatter.format(estimated)}
            </span>
            <span className="text-[11px] text-muted-foreground">estimado</span>
            <div className="ml-auto flex items-center gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={onClose}>
                Cancelar
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={marked === 0}
                title={marked === 0 ? "Selecione ao menos um item" : undefined}
                onClick={apply}
              >
                <Icon icon="mdi:plus" size={15} />
                Adicionar {marked} {marked === 1 ? "item" : "itens"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </SheetFrame>
  );
}

function SheetFrame({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <section
      aria-label="Kits"
      className="overflow-hidden rounded-lg border border-border bg-background/40"
    >
      <header className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        <Icon icon="lucide:boxes" size={14} className="text-primary" />
        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Kits
        </h3>
        <span className="font-semicond text-[11.5px] text-muted-foreground">
          opcionais vêm desmarcados — são sugestões
        </span>
        <button
          type="button"
          onClick={onClose}
          title="Fechar (Esc)"
          aria-label="Fechar kits"
          className="ml-auto grid h-6 w-6 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Icon icon="mdi:close" size={15} />
        </button>
      </header>
      {children}
    </section>
  );
}

/** Shown when the store has no kits at all — the feature stays discoverable. */
function EmptyKits() {
  const navigate = useNavigate();
  const canManageModels = usePermission("vehicleModel", "view");
  return (
    <div className="px-3 py-3.5">
      <p className="text-sm font-medium text-foreground">Nenhum kit cadastrado</p>
      <p className="mt-1 max-w-prose text-xs text-muted-foreground">
        Kits reúnem as peças de uma revisão — filtros, óleo, reparo — para entrar no orçamento de
        uma vez. Quando um kit oficial combina com o veículo do cliente, ele passa a ser sugerido
        sozinho aqui.
      </p>
      {canManageModels && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={() => void navigate({ to: "/app/kits" })}
        >
          <Icon icon="mdi:plus" size={15} />
          Criar kit por modelo
        </Button>
      )}
    </div>
  );
}

function KitLine({
  line,
  state,
  alreadyInQuote,
  onToggle,
  onQuantity,
}: {
  line: IKitPreviewLine;
  state: ILineState;
  alreadyInQuote: number;
  onToggle: (checked: boolean) => void;
  onQuantity: (quantity: number) => void;
}) {
  const priced = hasPrice(line.part);
  const subtotal = priced && state.checked ? line.part.unitPrice * state.quantity : null;
  return (
    <div
      className={`grid ${KIT_ROW} items-center gap-2 px-0.5 py-1.5 transition-opacity motion-reduce:transition-none ${
        state.checked ? "" : "opacity-60"
      }`}
    >
      <Checkbox
        checked={state.checked}
        onCheckedChange={(v) => onToggle(v === true)}
        aria-label={line.part.name}
      />
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-xs font-medium text-foreground">{line.part.name}</span>
          {alreadyInQuote > 0 && (
            <span className="shrink-0 rounded border border-severity-success/40 bg-severity-success/10 px-1 text-[10px] uppercase text-severity-success">
              já no orçamento · {alreadyInQuote}
            </span>
          )}
        </div>
        <p className="truncate font-semicond text-[11px] text-muted-foreground">
          {line.part.sku}
          {line.note ? ` · ${line.note}` : ""}
        </p>
      </div>
      <span className="text-right text-[11px] text-muted-foreground">
        {priced ? (
          moneyFormatter.format(line.part.unitPrice)
        ) : (
          <span className="rounded border border-border px-1 text-[10px] uppercase">sem preço</span>
        )}
      </span>
      <span className="flex justify-center">
        <span className="flex items-center overflow-hidden rounded-md border border-border">
          <button
            type="button"
            disabled={!state.checked}
            onClick={() => onQuantity(state.quantity - 1)}
            aria-label={`Diminuir quantidade de ${line.part.name}`}
            className="grid h-6 w-5 place-items-center text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
          >
            <Icon icon="mdi:minus" size={12} />
          </button>
          <span className="min-w-5 text-center text-xs font-semibold tabular-nums text-foreground">
            {state.quantity}
          </span>
          <button
            type="button"
            disabled={!state.checked}
            onClick={() => onQuantity(state.quantity + 1)}
            aria-label={`Aumentar quantidade de ${line.part.name}`}
            className="grid h-6 w-5 place-items-center text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
          >
            <Icon icon="mdi:plus" size={12} />
          </button>
        </span>
      </span>
      <span
        className={`text-right text-xs font-semibold tabular-nums ${
          subtotal !== null ? "text-foreground" : "text-muted-foreground"
        }`}
      >
        {subtotal !== null ? moneyFormatter.format(subtotal) : "R$ —"}
      </span>
    </div>
  );
}
