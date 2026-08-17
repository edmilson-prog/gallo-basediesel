import { useState } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { toast } from "sonner";
import { Icon } from "@/components/Icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ID } from "@/shared/types";
import { NoteItemDrawer } from "../components/review/NoteItemDrawer";
import { NoteItemsTable } from "../components/review/NoteItemsTable";
import { autoConfirmable } from "../engine/postEffects";
import { useNoteReview } from "../hooks/useNoteReview";
import { FISCAL_NOTES_STRINGS } from "../i18n/pt-BR";

const brl = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function FiscalNoteReviewPage() {
  const { id } = useParams({ from: "/app/suprimentos/entrada/$id" });
  const navigate = useNavigate();
  const [openItemId, setOpenItemId] = useState<ID | null>(null);
  const review = useNoteReview(id);
  const s = FISCAL_NOTES_STRINGS.review;

  const { note, parts, partsById, validation, isLoading, isError, isMutating } = review;

  if (isLoading) {
    return (
      <div className="space-y-2 p-6">
        {Array.from({ length: 5 }).map((_, index) => (
          <div
            key={index}
            className="h-14 animate-pulse rounded-md bg-muted motion-reduce:animate-none"
          />
        ))}
      </div>
    );
  }

  if (isError || !note) {
    return (
      <div className="grid h-full place-items-center gap-3 p-8 text-center">
        <p className="font-display text-lg font-extrabold uppercase text-foreground">
          {s.notFound}
        </p>
        <Button size="sm" onClick={() => void navigate({ to: "/app/suprimentos/notas" })}>
          {FISCAL_NOTES_STRINGS.pageTitle}
        </Button>
      </div>
    );
  }

  const posted = note.status === "lancada";
  const pending = note.items.filter((item) => !item.confirmed).length;
  const done = note.items.length - pending;
  const openItem = openItemId ? note.items.find((item) => item.id === openItemId) : undefined;
  const batchCount = autoConfirmable(note).length;

  async function handlePost() {
    try {
      await review.post();
      toast.success(s.postDone);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : s.blockers.unconfirmed);
    }
  }

  async function handleReverse() {
    try {
      await review.reverse();
      toast.success(s.reverseDone);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : s.blockers.not_in_review);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex shrink-0 flex-col gap-1 border-b border-border/40 bg-background/85 px-4 py-3 shadow-lg shadow-foreground/5 backdrop-blur-2xl backdrop-saturate-[1.8] supports-[backdrop-filter]:bg-background/50 md:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-md bg-primary/10 text-primary">
            <Icon icon="mdi:clipboard-check-outline" size={20} aria-hidden />
          </div>
          <div className="min-w-0">
            <h1 className="font-display text-xl font-extrabold uppercase leading-none tracking-[0.01em] text-foreground">
              NF {note.number} · série {note.series}
            </h1>
            <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">{note.accessKey}</p>
          </div>
          <Badge
            variant="outline"
            className={
              posted
                ? "border-severity-success/40 text-severity-success"
                : "border-severity-warning/40 text-severity-warning"
            }
          >
            {FISCAL_NOTES_STRINGS.status[note.status]}
          </Badge>
          <div className="ml-auto flex items-center gap-3">
            <span className="text-[12px] tabular-nums text-muted-foreground">
              {s.progress(done, note.items.length)}
            </span>
            <span className="h-1.5 w-28 overflow-hidden rounded-full bg-muted">
              <span
                className={`block h-full transition-[width] duration-300 motion-reduce:transition-none ${
                  pending ? "bg-severity-warning" : "bg-severity-success"
                }`}
                style={{ width: `${(done / Math.max(1, note.items.length)) * 100}%` }}
              />
            </span>
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-auto px-4 py-4 md:px-6">
        {posted && (
          <div className="mb-4 flex items-start gap-3 rounded-xl border border-severity-success/40 bg-severity-success/10 px-4 py-3">
            <Icon
              icon="mdi:check-circle-outline"
              size={20}
              className="mt-0.5 shrink-0 text-severity-success"
              aria-hidden
            />
            <div className="min-w-0">
              <p className="font-display text-[15px] font-extrabold uppercase text-foreground">
                {s.postedTitle}
              </p>
              <p className="mt-1 text-[12.5px] text-muted-foreground">{s.immutable}</p>
              <p className="mt-1 text-[11.5px] text-muted-foreground">{s.reverseKeepsCost}</p>
            </div>
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <section>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-bold text-foreground">{s.itemsTitle}</h2>
              <span className="text-[12px] text-muted-foreground">{s.itemsHint}</span>
              {!posted && (
                <Button
                  size="sm"
                  variant="outline"
                  className="ml-auto"
                  disabled={isMutating || batchCount === 0}
                  onClick={async () => {
                    const n = await review.confirmLinked();
                    toast.success(s.confirmLinkedDone(n));
                  }}
                >
                  <Icon icon="mdi:check-all" size={14} aria-hidden />
                  {s.confirmLinked}
                  {batchCount > 0 ? ` · ${batchCount}` : ""}
                </Button>
              )}
            </div>
            <NoteItemsTable
              note={note}
              partsById={partsById}
              readOnly={posted}
              onOpenItem={setOpenItemId}
            />
          </section>

          <aside className="flex flex-col gap-3">
            <div className="rounded-xl border border-border bg-card p-3">
              <h3 className="font-semicond text-[10.5px] uppercase tracking-[0.1em] text-muted-foreground">
                {s.totals.title}
              </h3>
              {(
                [
                  [s.totals.products, note.productsTotal],
                  [s.totals.freight, note.freight],
                  [s.totals.ipi, note.ipi],
                  [s.totals.discount, -note.discount],
                ] as Array<[string, number]>
              ).map(([label, value]) => (
                <div
                  key={label}
                  className="flex justify-between border-b border-border py-1.5 text-[12.5px]"
                >
                  <span className="text-muted-foreground">{label}</span>
                  <span
                    className={value ? "tabular-nums text-foreground" : "text-muted-foreground"}
                  >
                    {value ? brl(value) : "—"}
                  </span>
                </div>
              ))}
              <div className="flex items-baseline justify-between pt-2.5">
                <span className="font-semicond text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
                  {s.totals.total}
                </span>
                <span className="font-display text-xl font-extrabold tabular-nums text-foreground">
                  {brl(note.total)}
                </span>
              </div>
              <p className="mt-1.5 text-[11px] text-muted-foreground">{s.totals.hint}</p>
            </div>

            <div className="rounded-xl border border-border bg-card p-3">
              <h3 className="font-semicond text-[10.5px] uppercase tracking-[0.1em] text-muted-foreground">
                {s.duplicates.title}
              </h3>
              {note.duplicates.map((duplicate) => (
                <div
                  key={duplicate.id}
                  className="flex items-center gap-2 border-b border-border py-1.5 text-[12.5px]"
                >
                  <span className="w-8 text-muted-foreground">{duplicate.number}</span>
                  <span className="text-muted-foreground">
                    {new Date(duplicate.dueDate).toLocaleDateString("pt-BR", {
                      day: "2-digit",
                      month: "2-digit",
                    })}
                  </span>
                  <span className="ml-auto font-bold tabular-nums text-foreground">
                    {brl(duplicate.amount)}
                  </span>
                </div>
              ))}
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                {posted ? s.duplicates.posted : s.duplicates.preview}
              </p>
            </div>

            {posted ? (
              <Button variant="outline" disabled={isMutating} onClick={handleReverse}>
                <Icon icon="mdi:undo-variant" size={16} aria-hidden />
                {s.reverseCta}
              </Button>
            ) : (
              <Button size="lg" disabled={!validation.ok || isMutating} onClick={handlePost}>
                <Icon icon="mdi:warehouse" size={16} aria-hidden />
                {validation.ok ? s.postCta : s.postBlocked(validation.blockers.length)}
              </Button>
            )}
          </aside>
        </div>
      </div>

      {openItem && !posted && (
        <NoteItemDrawer
          item={openItem}
          note={note}
          parts={parts}
          partsById={partsById}
          supplierName={review.supplierName}
          isSaving={isMutating}
          onClose={() => setOpenItemId(null)}
          onConfirm={async (patch) => {
            await review.confirmItem(openItem.id, patch);
            setOpenItemId(null);
          }}
        />
      )}
    </div>
  );
}
