import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { LeadFunnelStageKind } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { FUNNEL_ACCENT_SLOTS, getAccentClasses } from "../../engine/accentClasses";
import type { IStageDraft } from "../../engine/stageRules";
import { COPY } from "../../i18n/pt-BR";

const KINDS: LeadFunnelStageKind[] = ["entrada", "aberta", "ganho", "perda"];

export interface IStageRowProps {
  stage: IStageDraft;
  leadCount: number;
  onChange: (patch: Partial<IStageDraft>) => void;
  onRemove: () => void;
  removeBlockedReason?: string;
}

export function StageRow({
  stage,
  leadCount,
  onChange,
  onRemove,
  removeBlockedReason,
}: IStageRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: stage.id,
  });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex items-center gap-2 rounded-md border border-border bg-card p-2",
        isDragging && "opacity-60 shadow-lg",
      )}
    >
      {/* A dedicated handle, not the whole row: making the row draggable would
          make the name field unusable, because every click-drag inside it would
          start a drag instead of selecting text. */}
      <button
        type="button"
        aria-label={COPY.admin.stages.reorder}
        {...attributes}
        {...listeners}
        className="inline-flex size-6 shrink-0 cursor-grab touch-none items-center justify-center rounded text-muted-foreground hover:bg-muted active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Icon icon="mdi:drag-vertical" size={16} aria-hidden />
      </button>

      <Input
        value={stage.name}
        maxLength={40}
        placeholder={COPY.admin.stages.namePlaceholder}
        aria-label={COPY.admin.stages.nameLabel(stage.name)}
        onChange={(e) => onChange({ name: e.target.value })}
        className="h-8 min-w-0 flex-1 text-xs"
      />

      {/* Nine enumerated slots, no colour picker: the funnel identity is a slot,
          never a hex (owner decision 7). */}
      <div
        role="group"
        aria-label={COPY.admin.stages.accentLabel(stage.name)}
        className="flex shrink-0 gap-0.5"
      >
        {FUNNEL_ACCENT_SLOTS.map((slot) => (
          <button
            key={slot}
            type="button"
            aria-label={`${slot}`}
            aria-pressed={stage.accent === slot}
            onClick={() => onChange({ accent: slot })}
            className={cn(
              "size-4 rounded-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              getAccentClasses(slot).dot,
              stage.accent === slot ? "ring-2 ring-ring ring-offset-1" : "opacity-50 hover:opacity-100",
            )}
          />
        ))}
      </div>

      <Select
        value={stage.kind}
        onValueChange={(v) => onChange({ kind: v as LeadFunnelStageKind })}
      >
        <SelectTrigger
          className="h-8 w-[110px] shrink-0 text-xs"
          aria-label={COPY.admin.stages.kindLabel(stage.name)}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {KINDS.map((k) => (
            <SelectItem key={k} value={k} className="text-xs">
              {COPY.admin.stages.kinds[k]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <span className="w-16 shrink-0 text-right text-[10px] tabular-nums text-muted-foreground">
        {COPY.admin.stages.leadCount(leadCount)}
      </span>

      <button
        type="button"
        onClick={onRemove}
        disabled={Boolean(removeBlockedReason)}
        title={removeBlockedReason ?? COPY.admin.stages.remove}
        aria-label={COPY.admin.stages.remove}
        className="inline-flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground transition hover:bg-muted hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Icon icon="mdi:close" size={14} aria-hidden />
      </button>
    </li>
  );
}
