import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Icon } from "@/components/Icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { ID } from "@/shared/types";
import { NoteItemDrawer } from "../components/review/NoteItemDrawer";
import { NoteItemsTable } from "../components/review/NoteItemsTable";
import { autoConfirmable } from "../engine/postEffects";
import { useFiscalNotesList } from "../hooks/useFiscalNotesList";
import { useNoteReview } from "../hooks/useNoteReview";
import { useCurrentStore } from "@/features/multistore";
import { FISCAL_NOTES_STRINGS } from "../i18n/pt-BR";

const brl = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export interface IFiscalNoteReviewPageProps {
  /**
   * Nota a conferir. Sem ela a tela vira destino de menu e escolhe sozinha a
   * primeira em conferência — é assim que o kit desenha a Entrada de nota.
   */
  noteId?: ID;
}

export function FiscalNoteReviewPage({ noteId }: IFiscalNoteReviewPageProps = {}) {
  const navigate = useNavigate();
  const { currentStoreId } = useCurrentStore();
  const [openItemId, setOpenItemId] = useState<ID | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const s = FISCAL_NOTES_STRINGS.review;

  // Todas as notas com item, para o seletor e para o fallback de seleção.
  const { notes: allNotes, isLoading: listLoading } = useFiscalNotesList({
    storeId: currentStoreId,
  });
  // Rascunho entra no seletor: estacionar uma nota não pode escondê-la de quem
  // quer retomá-la.
  const selectable = allNotes;
  const effectiveId =
    noteId ?? selectable.find((n) => n.status === "conferencia")?.id ?? selectable[0]?.id;

  const review = useNoteReview(effectiveId);

  const { note, parts, partsById, validation, isError, isMutating } = review;
  const isLoading = listLoading || (effectiveId !== undefined && review.isLoading);

  // Nenhuma nota na loja: estado vazio próprio, com o caminho de saída.
  if (!isLoading && selectable.length === 0) {
    return (
      <div className="grid h-full place-items-center gap-3 p-8 text-center">
        <Icon
          icon="mdi:clipboard-check-outline"
          size={30}
          className="text-muted-foreground"
          aria-hidden
        />
        <p className="font-display text-lg font-extrabold uppercase text-foreground">
          {s.emptyTitle}
        </p>
        <p className="max-w-sm text-sm text-muted-foreground">{s.emptyDescription}</p>
        <Button size="sm" onClick={() => void navigate({ to: "/app/suprimentos/importar" })}>
          <Icon icon="mdi:file-upload-outline" size={15} aria-hidden />
          {FISCAL_NOTES_STRINGS.list.importCta}
        </Button>
      </div>
    );
  }

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
  const isDraft = note.status === "rascunho";
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
              {s.title}
            </h1>
            <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">{note.accessKey}</p>
          </div>

          {/* Seletor do kit: a tela troca de nota sem voltar para a lista. */}
          <label className="sr-only" htmlFor="nf-note-select">
            {s.selectLabel}
          </label>
          <select
            id="nf-note-select"
            value={note.id}
            onChange={(e) =>
              void navigate({
                to: "/app/suprimentos/entrada/$id",
                params: { id: e.target.value },
              })
            }
            className="h-9 max-w-[340px] flex-1 rounded-md border border-input bg-background px-2 text-sm font-medium text-foreground"
          >
            {selectable.map((option) => (
              <option key={option.id} value={option.id}>
                NF {option.number} · {FISCAL_NOTES_STRINGS.status[option.status]}
              </option>
            ))}
          </select>
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

        {isDraft && (
          <div className="mb-4 flex items-start gap-3 rounded-xl border border-severity-info/40 bg-severity-info/10 px-4 py-3">
            <Icon
              icon="mdi:content-save-outline"
              size={20}
              className="mt-0.5 shrink-0 text-severity-info"
              aria-hidden
            />
            <p className="text-[12.5px] text-muted-foreground">{s.draftBanner}</p>
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
              <>
                {!isDraft && (
                  <Button size="lg" disabled={!validation.ok || isMutating} onClick={handlePost}>
                    <Icon icon="mdi:warehouse" size={16} aria-hidden />
                    {validation.ok ? s.postCta : s.postBlocked(validation.blockers.length)}
                  </Button>
                )}
                <Button
                  variant="outline"
                  disabled={isMutating}
                  onClick={async () => {
                    if (isDraft) {
                      await review.resumeFromDraft();
                      toast.success(s.resumeDone);
                    } else {
                      await review.markDraft();
                      toast.success(s.draftDone);
                    }
                  }}
                >
                  <Icon
                    icon={isDraft ? "mdi:play-outline" : "mdi:content-save-outline"}
                    size={16}
                    aria-hidden
                  />
                  {isDraft ? s.resumeCta : s.draftCta}
                </Button>
                <Button
                  variant="ghost"
                  disabled={isMutating}
                  className="text-severity-critical hover:bg-severity-critical/10 hover:text-severity-critical"
                  onClick={() => setConfirmDiscard(true)}
                >
                  <Icon icon="mdi:trash-can-outline" size={16} aria-hidden />
                  {s.discardCta}
                </Button>
              </>
            )}
          </aside>
        </div>
      </div>

      <AlertDialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{s.discardTitle.replace("{num}", note.number)}</AlertDialogTitle>
            <AlertDialogDescription>{s.discardBody}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isMutating}>{s.discardCancel}</AlertDialogCancel>
            <AlertDialogAction
              disabled={isMutating}
              className="bg-severity-critical text-white hover:bg-severity-critical/90"
              onClick={async () => {
                const num = note.number;
                await review.remove();
                setConfirmDiscard(false);
                toast.success(s.discardDone(num));
                void navigate({ to: "/app/suprimentos/notas" });
              }}
            >
              {s.discardConfirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
          onSaveDraft={async (patch) => {
            await review.saveItemDraft(openItem.id, patch);
            setOpenItemId(null);
          }}
        />
      )}
    </div>
  );
}
