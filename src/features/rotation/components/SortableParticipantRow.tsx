import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";

interface ISortableParticipantRowProps {
  id: string;
  label: string;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  onRemove: () => void;
  /** Optional secondary action (department rows: open the internal members list). */
  onManage?: () => void;
  manageActive?: boolean;
}

/** A drag-reorderable row (keyboard-accessible via the dnd-kit handle). Reused
 *  for both seller participants and department participants (the latter pass
 *  `onManage` to expand their internal members list). */
export function SortableParticipantRow({
  id,
  label,
  enabled,
  onToggle,
  onRemove,
  onManage,
  manageActive = false,
}: ISortableParticipantRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };
  return (
    <li
      ref={setNodeRef}
      style={style}
      className="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2"
    >
      <span className="flex items-center gap-2">
        <button
          type="button"
          className="cursor-grab text-muted-foreground hover:text-foreground"
          aria-label={`Reordenar ${label}`}
          {...attributes}
          {...listeners}
        >
          <Icon icon="mdi:drag-vertical" size={18} />
        </button>
        <span className="text-sm text-foreground">{label}</span>
      </span>
      <span className="flex items-center gap-3">
        {onManage && (
          <Button
            type="button"
            variant={manageActive ? "secondary" : "ghost"}
            size="sm"
            onClick={onManage}
          >
            Membros
          </Button>
        )}
        <Switch
          checked={enabled}
          onCheckedChange={onToggle}
          aria-label={`Participação de ${label}`}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Remover ${label} do rodízio`}
          onClick={onRemove}
        >
          <Icon icon="mdi:close" size={16} />
        </Button>
      </span>
    </li>
  );
}
