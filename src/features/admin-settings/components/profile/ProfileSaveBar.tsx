import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";

interface IProfileSaveBarProps {
  /** Only rendered when there are pending edits. */
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
  onDiscard: () => void;
}

/**
 * Sticky action bar that appears at the bottom of the page while the contact
 * form has unsaved edits.
 */
export function ProfileSaveBar({ dirty, saving, onSave, onDiscard }: IProfileSaveBarProps) {
  if (!dirty) return null;
  return (
    <div
      role="status"
      className="sticky bottom-0 z-20 mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card/95 px-5 py-3 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-card/80"
    >
      <span aria-hidden className="size-2 shrink-0 rounded-full bg-primary" />
      <span className="text-sm font-semibold text-foreground">Você tem alterações não salvas</span>
      <span className="text-xs text-muted-foreground">· o registro vai para a auditoria</span>
      <div className="ml-auto flex gap-2">
        <Button variant="ghost" size="sm" onClick={onDiscard} disabled={saving}>
          Descartar
        </Button>
        <Button size="sm" onClick={onSave} disabled={saving}>
          <Icon icon="lucide:check" className="size-3.5" />
          {saving ? "Salvando…" : "Salvar alterações"}
        </Button>
      </div>
    </div>
  );
}
