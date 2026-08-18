import { useState } from "react";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { IUpdateFiscalNoteItemPatch } from "@/providers/data";
import type { ID, IFiscalNote, IFiscalNoteItem, IPart, ItemConversionMode } from "@/shared/types";
import { computeItemEffect } from "../../engine/postEffects";
import { FISCAL_NOTES_STRINGS } from "../../i18n/pt-BR";

const UNITS = ["UN", "CX", "PCT", "BD", "TB", "L", "KG", "M"] as const;

const brl = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const qty = (value: number) => value.toLocaleString("pt-BR", { maximumFractionDigits: 2 });

export interface INoteItemDrawerProps {
  item: IFiscalNoteItem;
  note: IFiscalNote;
  parts: IPart[];
  partsById: Map<ID, IPart>;
  supplierName: string;
  onClose: () => void;
  onConfirm: (patch: IUpdateFiscalNoteItemPatch) => void;
  isSaving: boolean;
}

export function NoteItemDrawer({
  item,
  note,
  parts,
  partsById,
  supplierName,
  onClose,
  onConfirm,
  isSaving,
}: INoteItemDrawerProps) {
  const s = FISCAL_NOTES_STRINGS.review.drawer;

  const [linkKind, setLinkKind] = useState<"sku" | "novo">(
    item.linkMode === "novo" ? "novo" : "sku",
  );
  const [partId, setPartId] = useState(item.partId ?? "");
  const [newName, setNewName] = useState(item.newPartDraft?.name ?? "");
  const [newUnit, setNewUnit] = useState(item.newPartDraft?.unitOfMeasure ?? "UN");
  const [mode, setMode] = useState<ItemConversionMode>(item.conversionMode);
  const [factor, setFactor] = useState(item.conversionFactor?.toString() ?? "");
  const [unit, setUnit] = useState(item.conversionUnit ?? "UN");
  const [fractionTarget, setFractionTarget] = useState(item.conversionTargetPartId ?? "");

  // A prévia usa o MESMO motor do lançamento — o que a gaveta mostra é
  // exatamente o que a RPC vai gravar.
  const draft: IFiscalNoteItem = {
    ...item,
    partId: linkKind === "sku" ? partId || undefined : undefined,
    conversionMode: mode,
    conversionFactor: mode === "direto" ? null : Number(factor) || null,
    conversionUnit: mode === "direto" ? undefined : unit,
    conversionTargetPartId: mode === "frac" ? fractionTarget || undefined : undefined,
  };
  const targetId = mode === "frac" ? fractionTarget : partId;
  const effect = computeItemEffect(draft, note, partsById.get(targetId));
  const linkedPart = partsById.get(targetId);

  const valid =
    (linkKind === "novo" ? newName.trim().length > 0 : Boolean(partId)) &&
    (mode === "direto" || Number(factor) > 0) &&
    (mode !== "frac" || Boolean(fractionTarget));

  function save() {
    onConfirm({
      linkMode: linkKind === "novo" ? "novo" : item.linkMode === "pend" ? "auto" : item.linkMode,
      partId: linkKind === "sku" ? partId : undefined,
      newPartDraft:
        linkKind === "novo" ? { name: newName.trim(), unitOfMeasure: newUnit } : undefined,
      conversionMode: mode,
      conversionFactor: mode === "direto" ? null : Number(factor),
      conversionUnit: mode === "direto" ? undefined : unit,
      conversionTargetPartId: mode === "frac" ? fractionTarget : undefined,
    });
  }

  const segment = (active: boolean, label: string, onClick: () => void, key: string) => (
    <Button
      key={key}
      type="button"
      size="sm"
      variant={active ? "default" : "outline"}
      onClick={onClick}
    >
      {label}
    </Button>
  );

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="font-mono text-sm">{item.supplierCode}</SheetTitle>
          <SheetDescription>{item.description}</SheetDescription>
        </SheetHeader>

        <div className="grid grid-cols-3 gap-3 rounded-xl border border-border bg-card p-3">
          <div>
            <p className="font-semicond text-[10.5px] uppercase tracking-[0.1em] text-muted-foreground">
              Na nota
            </p>
            <p className="mt-1 text-sm font-bold tabular-nums text-foreground">
              {qty(item.quantity)} {item.unit}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {brl(item.unitValue)} / {item.unit}
            </p>
          </div>
          <div>
            <p className="font-semicond text-[10.5px] uppercase tracking-[0.1em] text-muted-foreground">
              Total do item
            </p>
            <p className="mt-1 text-sm font-bold tabular-nums text-foreground">
              {brl(item.totalValue)}
            </p>
            <p className="text-[11px] text-muted-foreground">
              + {brl(effect.allocatedCharges)} rateio
            </p>
          </div>
          <div>
            <p className="font-semicond text-[10.5px] uppercase tracking-[0.1em] text-muted-foreground">
              Fiscal
            </p>
            <p className="mt-1 text-sm font-bold text-foreground">{item.cfop ?? "—"}</p>
            <p className="text-[11px] text-muted-foreground">NCM {item.ncm ?? "—"}</p>
          </div>
        </div>

        {item.alert && (
          <p className="mt-3 rounded-lg border border-severity-warning/40 bg-severity-warning/10 px-3 py-2 text-[12.5px] text-foreground">
            <Icon icon="mdi:alert-outline" size={14} className="mr-1 inline" aria-hidden />
            {item.alert}
          </p>
        )}

        {item.linkMode === "ia" && item.aiEvidence && (
          <p className="mt-3 rounded-lg border border-severity-info/40 bg-severity-info/10 px-3 py-2 text-[12.5px] text-foreground">
            <span className="font-bold">{s.aiEvidence(item.aiConfidence ?? 0)}</span>{" "}
            {item.aiEvidence}
          </p>
        )}

        <h3 className="mt-5 font-semicond text-[10.5px] uppercase tracking-[0.12em] text-muted-foreground">
          {s.linkSection}
        </h3>
        <div className="mt-2 flex gap-2">
          {segment(linkKind === "sku", s.linkToCatalog, () => setLinkKind("sku"), "sku")}
          {segment(linkKind === "novo", s.createNew, () => setLinkKind("novo"), "novo")}
        </div>

        {linkKind === "sku" ? (
          <div className="mt-3">
            <Label htmlFor="nf-part">{s.productLabel}</Label>
            <select
              id="nf-part"
              value={partId}
              onChange={(e) => setPartId(e.target.value)}
              className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground"
            >
              <option value="">{s.chooseProduct}</option>
              {parts.map((part) => (
                <option key={part.id} value={part.id}>
                  {part.sku} — {part.name}
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              {linkedPart
                ? s.stockHint(
                    linkedPart.stockAvailable,
                    linkedPart.unitOfMeasure ?? "UN",
                    brl(linkedPart.averageCost ?? 0),
                  )
                : s.mapHint(item.supplierCode)}
            </p>
          </div>
        ) : (
          <div className="mt-3 grid grid-cols-[1fr_96px] gap-3">
            <div>
              <Label htmlFor="nf-new-name">{s.newNameLabel}</Label>
              <Input
                id="nf-new-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={s.newNamePlaceholder}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="nf-new-unit">{s.unitLabel}</Label>
              <select
                id="nf-new-unit"
                value={newUnit}
                onChange={(e) => setNewUnit(e.target.value)}
                className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground"
              >
                {UNITS.map((u) => (
                  <option key={u}>{u}</option>
                ))}
              </select>
            </div>
            <p className="col-span-2 text-[11px] text-muted-foreground">
              {s.newPartHint(item.ncm ?? "—")}
            </p>
          </div>
        )}

        <h3 className="mt-5 font-semicond text-[10.5px] uppercase tracking-[0.12em] text-muted-foreground">
          {s.conversionSection}
        </h3>
        <div className="mt-2 flex flex-wrap gap-2">
          {segment(mode === "direto", s.direct, () => setMode("direto"), "direto")}
          {segment(mode === "conv", s.convert, () => setMode("conv"), "conv")}
          {segment(mode === "frac", s.fraction, () => setMode("frac"), "frac")}
        </div>

        <div className="mt-3">
          {mode === "direto" && (
            <p className="text-[12.5px] text-muted-foreground">
              {s.directHint(qty(item.quantity), effect.stockUnit)}
            </p>
          )}

          {mode !== "direto" && (
            <div className="grid grid-cols-2 gap-3">
              {mode === "frac" && (
                <div className="col-span-2">
                  <Label htmlFor="nf-frac-target">{s.fractionTargetLabel}</Label>
                  <select
                    id="nf-frac-target"
                    value={fractionTarget}
                    onChange={(e) => setFractionTarget(e.target.value)}
                    className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground"
                  >
                    <option value="">{s.fractionTargetPlaceholder}</option>
                    {parts.map((part) => (
                      <option key={part.id} value={part.id}>
                        {part.sku} — {part.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <Label htmlFor="nf-factor">
                  {mode === "frac" ? s.yieldLabel(item.unit) : s.factorLabel(item.unit)}
                </Label>
                <Input
                  id="nf-factor"
                  type="number"
                  min="1"
                  value={factor}
                  onChange={(e) => setFactor(e.target.value)}
                  placeholder={mode === "frac" ? "ex.: 20" : "ex.: 12"}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="nf-unit">
                  {mode === "frac" ? s.fractionUnitLabel : s.stockUnitLabel}
                </Label>
                <select
                  id="nf-unit"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground"
                >
                  {UNITS.map((u) => (
                    <option key={u}>{u}</option>
                  ))}
                </select>
              </div>
              {mode === "frac" && (
                <p className="col-span-2 text-[11px] text-muted-foreground">
                  {s.fractionHint(item.unit, supplierName)}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="mt-4 rounded-xl border border-border bg-card p-3">
          <p className="flex items-center gap-2 text-[12.5px] font-bold text-foreground">
            <Icon
              icon="mdi:warehouse"
              size={14}
              className={
                effect.stockQuantity !== null ? "text-severity-success" : "text-muted-foreground"
              }
              aria-hidden
            />
            {effect.stockQuantity !== null
              ? s.previewStock(
                  `${qty(item.quantity)} ${item.unit}`,
                  `${qty(effect.stockQuantity)} ${effect.stockUnit}`,
                )
              : s.previewEmpty}
          </p>
          {effect.unitCost !== null && (
            <p className="mt-1.5 text-[12px] text-muted-foreground">
              {s.previewCost(brl(effect.unitCost), effect.stockUnit)}
              {effect.averageCostDelta !== null && linkedPart?.averageCost ? (
                <span
                  className={
                    Math.abs(effect.averageCostDelta) < 0.01
                      ? ""
                      : effect.averageCostDelta > 0
                        ? " text-severity-warning"
                        : " text-severity-success"
                  }
                >
                  {" · "}
                  {s.previewDelta(
                    `${effect.averageCostDelta > 0 ? "+" : ""}${((effect.averageCostDelta / linkedPart.averageCost) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`,
                  )}
                </span>
              ) : null}
            </p>
          )}
        </div>

        <div className="mt-5 flex gap-2 pb-2">
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            {s.cancel}
          </Button>
          <Button className="flex-1" disabled={!valid || isSaving} onClick={save}>
            <Icon icon="mdi:check" size={15} aria-hidden />
            {linkKind === "novo" ? s.confirmNew : s.confirm}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
