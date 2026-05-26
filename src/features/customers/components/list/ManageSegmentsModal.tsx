import { useState } from "react";
import type { ICustomerSegment, ID, SegmentScope } from "@/shared/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Icon } from "@/components/Icon";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface IManageSegmentsModalProps {
  open: boolean;
  segments: ICustomerSegment[];
  canEditShared: boolean;
  currentUserId: ID | null;
  onClose: () => void;
  onUpdate: (id: ID, patch: { name?: string; scope?: SegmentScope }) => Promise<void>;
  onDelete: (id: ID) => Promise<void>;
}

export function ManageSegmentsModal({
  open,
  segments,
  canEditShared,
  currentUserId,
  onClose,
  onUpdate,
  onDelete,
}: IManageSegmentsModalProps) {
  const [editingId, setEditingId] = useState<ID | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftScope, setDraftScope] = useState<SegmentScope>("private");
  const [busyId, setBusyId] = useState<ID | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<ID | null>(null);

  const ownSegments = segments.filter((s) => s.ownerId === currentUserId || canEditShared);

  const startEdit = (segment: ICustomerSegment) => {
    setEditingId(segment.id);
    setDraftName(segment.name);
    setDraftScope(segment.scope);
  };

  const handleSaveEdit = async (segment: ICustomerSegment) => {
    setBusyId(segment.id);
    try {
      await onUpdate(segment.id, { name: draftName.trim(), scope: draftScope });
      setEditingId(null);
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (segment: ICustomerSegment) => {
    setBusyId(segment.id);
    try {
      await onDelete(segment.id);
      setConfirmDeleteId(null);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Gerenciar segmentações</DialogTitle>
          <DialogDescription>
            Renomeie, ajuste o escopo ou exclua as segmentações que você pode editar.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[480px] space-y-2 overflow-y-auto pr-1">
          {ownSegments.length === 0 && (
            <p className="rounded-md border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
              Você ainda não tem segmentações para gerenciar.
            </p>
          )}
          {ownSegments.map((segment) => {
            const isEditing = editingId === segment.id;
            const isBusy = busyId === segment.id;
            const canEdit =
              segment.ownerId === currentUserId || (segment.scope === "shared" && canEditShared);
            return (
              <div key={segment.id} className="rounded-md border border-border bg-card p-3">
                {isEditing ? (
                  <div className="space-y-2">
                    <Input
                      value={draftName}
                      onChange={(e) => setDraftName(e.target.value)}
                      maxLength={50}
                      autoFocus
                    />
                    <Select
                      value={draftScope}
                      onValueChange={(v) => setDraftScope(v as SegmentScope)}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="private">Privada</SelectItem>
                        <SelectItem value="shared" disabled={!canEditShared}>
                          Compartilhada
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditingId(null)}
                        disabled={isBusy}
                      >
                        Cancelar
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleSaveEdit(segment)}
                        disabled={isBusy || !draftName.trim()}
                      >
                        {isBusy ? "Salvando…" : "Salvar"}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{segment.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {segment.scope === "private" ? "Privada" : "Compartilhada"}
                        {segment.description ? ` · ${segment.description}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={!canEdit}
                        onClick={() => startEdit(segment)}
                        aria-label="Editar"
                      >
                        <Icon icon="mdi:pencil-outline" size={16} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={!canEdit}
                        onClick={() => setConfirmDeleteId(segment.id)}
                        aria-label="Excluir"
                      >
                        <Icon icon="mdi:trash-can-outline" size={16} className="text-destructive" />
                      </Button>
                    </div>
                  </div>
                )}
                {confirmDeleteId === segment.id && (
                  <div className="mt-2 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs">
                    <p className="mb-2 text-foreground">Excluir “{segment.name}”?</p>
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="sm" onClick={() => setConfirmDeleteId(null)}>
                        Cancelar
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDelete(segment)}
                        disabled={isBusy}
                      >
                        {isBusy ? "Excluindo…" : "Excluir"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
