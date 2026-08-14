import { useEffect, useMemo, useRef, useState } from "react";
import type { ID, IPart } from "@/shared/types";
import { Textarea } from "@/components/ui/textarea";
import { CATALOG_STRINGS } from "../../i18n/pt-BR";
import { isSaleReady, missingRequirements, type PartCodeState } from "../../engine/newPart";
import { PartPanel } from "../detail/PartPanel";
import { ApplicationsEditor } from "./ApplicationsEditor";
import { EquivalentsEditor } from "./EquivalentsEditor";
import { PartCrossReferenceEditor } from "./PartCrossReferenceEditor";
import { NewPartField } from "./new-part/NewPartField";
import { PartCategoryGrid } from "./new-part/PartCategoryGrid";
import { PartCodeBand } from "./new-part/PartCodeBand";
import { PartCommercialSection } from "./new-part/PartCommercialSection";
import { PartFormFooter } from "./new-part/PartFormFooter";
import { PartOriginToggle } from "./new-part/PartOriginToggle";
import { PartStockSection } from "./new-part/PartStockSection";
import {
  KNOWN_BRANDS,
  blankPartFormValues,
  partFormValuesFrom,
  toCompleteness,
  type IPartFormValues,
} from "./new-part/partFormValues";

const COPY = CATALOG_STRINGS.newPart;

export type { IPartFormValues };

export interface IPartFormProps {
  initial?: IPart;
  /**
   * Fields carried over from the part just saved ("Salvar e cadastrar outra").
   * Ignored when `initial` is set — duplicating a part already brings its own.
   */
  seed?: Partial<IPartFormValues>;
  /** Live verdict of the catalog lookup on `values.code`. */
  codeState: PartCodeState;
  /** The part already carrying the typed code, when there is one. */
  duplicate: IPart | null;
  /** Told on every keystroke so the page can run the lookup. */
  onValuesChange: (values: IPartFormValues) => void;
  saving: boolean;
  onSubmit: (values: IPartFormValues, options: { andAnother: boolean }) => void;
  onCancel: () => void;
  onOpenPart: (id: ID) => void;
}

/**
 * "Nova peça" — the code leads, the catalog answers while it is typed, and the
 * two work columns carry the rest.
 *
 * The old form was a single stack of six fieldsets in a narrow column, every
 * one of them weighted the same. The layout here says what the counter already
 * knows: the code is the fact you hold in your hand, identity and stock are
 * what you read off the box, category and price are what the business needs,
 * and fitment is the work that makes the part findable later.
 */
export function PartForm({
  initial,
  seed,
  codeState,
  duplicate,
  onValuesChange,
  saving,
  onSubmit,
  onCancel,
  onOpenPart,
}: IPartFormProps) {
  const [values, setValues] = useState<IPartFormValues>(() =>
    initial ? partFormValuesFrom(initial) : blankPartFormValues(seed),
  );

  // Arriving from "Duplicar peça": the source part loads after the first render.
  useEffect(() => {
    if (!initial) return;
    setValues(partFormValuesFrom(initial));
  }, [initial]);

  // The page needs the current code to run the catalog lookup. Reporting from
  // an effect — never from inside the state updater, which React may replay.
  const report = useRef(onValuesChange);
  report.current = onValuesChange;
  useEffect(() => {
    report.current(values);
  }, [values]);

  const set = <K extends keyof IPartFormValues>(key: K, value: IPartFormValues[K]) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  const completeness = useMemo(() => toCompleteness(values), [values]);
  const missing = missingRequirements(completeness, codeState);
  const saleReady = isSaleReady(completeness);
  const priceMissing = missing.includes("price");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (missing.length > 0 || saving) return;
    onSubmit(values, { andAnother: false });
  };

  return (
    <form onSubmit={handleSubmit} noValidate>
      <datalist id="new-part-brands">
        {KNOWN_BRANDS.map((brand) => (
          <option key={brand} value={brand} />
        ))}
      </datalist>

      <div className="space-y-3.5">
        <PartCodeBand
          code={values.code}
          onCodeChange={(next) => set("code", next)}
          state={codeState}
          duplicate={duplicate}
          onOpenPart={onOpenPart}
        />

        <div className="grid gap-3.5 lg:grid-cols-2 lg:items-start">
          <div className="space-y-3.5">
            <PartPanel title={COPY.identity.title} icon="mdi:tag-outline">
              <div className="space-y-3.5">
                <NewPartField
                  id="new-part-name"
                  label={COPY.identity.nameLabel}
                  note={COPY.identity.nameNote}
                  required
                  value={values.name}
                  onChange={(next) => set("name", next)}
                  placeholder={COPY.identity.namePlaceholder}
                />
                <div className="grid gap-3.5 sm:grid-cols-2">
                  <NewPartField
                    id="new-part-brand"
                    label={COPY.identity.brandLabel}
                    required
                    value={values.brand}
                    onChange={(next) => set("brand", next)}
                    list="new-part-brands"
                    placeholder={COPY.identity.brandPlaceholder}
                  />
                  <NewPartField
                    id="new-part-supplier"
                    label={COPY.identity.supplierLabel}
                    note={COPY.identity.supplierNote}
                    value={values.supplier}
                    onChange={(next) => set("supplier", next)}
                  />
                </div>
                <NewPartField
                  id="new-part-alt-codes"
                  label={COPY.identity.altCodesLabel}
                  note={COPY.identity.altCodesNote}
                  value={values.oemAlternatives}
                  onChange={(next) => set("oemAlternatives", next)}
                  mono
                  placeholder={COPY.identity.altCodesPlaceholder}
                />
                <PartOriginToggle
                  isOriginal={values.isOriginal}
                  onChange={(next) => set("isOriginal", next)}
                />
                <div>
                  <div className="mb-1.5 flex items-baseline gap-[7px]">
                    <label
                      htmlFor="new-part-description"
                      className="text-[10px] font-bold uppercase tracking-[0.13em] text-muted-foreground"
                    >
                      {COPY.identity.descriptionLabel}
                    </label>
                    <span className="text-[10.5px] text-muted-foreground/70">
                      {COPY.identity.descriptionNote}
                    </span>
                  </div>
                  <Textarea
                    id="new-part-description"
                    value={values.description}
                    onChange={(e) => set("description", e.target.value)}
                    rows={2}
                    className="resize-none bg-muted/40"
                  />
                </div>
              </div>
            </PartPanel>

            <PartPanel title={COPY.stock.title} icon="mdi:warehouse">
              <PartStockSection
                stockAvailable={values.stockAvailable}
                stockMinimum={values.stockMinimum}
                onStockChange={(next) => set("stockAvailable", next)}
                onMinimumChange={(next) => set("stockMinimum", next)}
              />
            </PartPanel>
          </div>

          <div className="space-y-3.5">
            <PartPanel
              title={COPY.category.title}
              icon="mdi:shape-outline"
              right={
                <span className="text-[11px] text-muted-foreground/70">{COPY.category.note}</span>
              }
            >
              <PartCategoryGrid
                category={values.category}
                subcategory={values.subcategory}
                onCategoryChange={(next) => set("category", next)}
                onSubcategoryChange={(next) => set("subcategory", next)}
                invalid={missing.includes("category")}
              />
            </PartPanel>

            <PartPanel
              title={COPY.commercial.title}
              icon="mdi:cash-multiple"
              right={
                <span className="hidden text-[11px] text-muted-foreground/70 sm:inline">
                  {COPY.commercial.note}
                </span>
              }
            >
              <PartCommercialSection
                unitCost={values.unitCost}
                markupPercent={values.markupPercent}
                directPrice={values.directPrice}
                onCostChange={(next) => set("unitCost", next)}
                onMarkupChange={(next) => set("markupPercent", next)}
                onDirectPriceChange={(next) => set("directPrice", next)}
                priceInvalid={priceMissing}
              />
            </PartPanel>
          </div>
        </div>

        <PartPanel
          title={COPY.fitment.title}
          icon="mdi:truck-outline"
          right={
            <span className="hidden text-[11px] text-muted-foreground/70 md:inline">
              {COPY.fitment.note}
            </span>
          }
        >
          <div className="space-y-4">
            <ApplicationsEditor
              applications={values.applications}
              onChange={(next) => set("applications", next)}
            />
            <div className="grid gap-4 border-t border-border pt-4 lg:grid-cols-2">
              <div>
                <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.13em] text-muted-foreground">
                  {COPY.fitment.equivalentsLabel}
                </div>
                <EquivalentsEditor
                  selectedIds={values.equivalentPartIds}
                  excludeId={initial?.id}
                  onChange={(next) => set("equivalentPartIds", next)}
                />
              </div>
              <div>
                <div className="mb-2 flex items-baseline gap-[7px]">
                  <span className="text-[10px] font-bold uppercase tracking-[0.13em] text-muted-foreground">
                    {COPY.fitment.crossReferencesLabel}
                  </span>
                  <span className="text-[10.5px] text-muted-foreground/70">
                    {COPY.fitment.crossReferencesNote}
                  </span>
                </div>
                <PartCrossReferenceEditor
                  value={values.crossReferences}
                  onChange={(next) => set("crossReferences", next)}
                />
              </div>
            </div>
          </div>
        </PartPanel>
      </div>

      <PartFormFooter
        missing={missing}
        saleReady={saleReady}
        saving={saving}
        onCancel={onCancel}
        onSaveAndNew={() => onSubmit(values, { andAnother: true })}
      />
    </form>
  );
}
