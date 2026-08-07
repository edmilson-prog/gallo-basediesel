import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Icon } from "@/components/Icon";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ID } from "@/shared/types";

/** Which bulk action the dialog is confirming. */
export type ContactBulkAction = "addTag" | "removeTag" | "transferOwner" | "optOut" | "export";

export interface IContactBulkActionDialogProps {
  action: ContactBulkAction | null;
  selectedCount: number;
  tagOptions: string[];
  ownerOptions: { id: ID; name: string }[];
  onClose: () => void;
  /** `value` is the chosen tag, owner id, or export scope, depending on the action. */
  onConfirm: (action: ContactBulkAction, value: string) => void;
}

const UNASSIGN = "__unassign__";

const EXPORT_SCOPES = [
  { id: "selected", label: "Contatos selecionados" },
  { id: "filtered", label: "Todos os filtrados" },
  { id: "all", label: "Toda a agenda" },
];

interface IActionCopy {
  title: string;
  icon: string;
  cta: string;
  destructive?: boolean;
}

const COPY: Record<ContactBulkAction, IActionCopy> = {
  addTag: { title: "Adicionar etiqueta", icon: "mdi:tag-plus-outline", cta: "Aplicar etiqueta" },
  removeTag: { title: "Remover etiqueta", icon: "mdi:tag-minus-outline", cta: "Remover" },
  transferOwner: {
    title: "Transferir responsável",
    icon: "mdi:account-switch-outline",
    cta: "Transferir",
  },
  optOut: {
    title: "Bloquear / opt-out",
    icon: "mdi:shield-off-outline",
    cta: "Confirmar opt-out",
    destructive: true,
  },
  export: { title: "Exportar contatos", icon: "mdi:download", cta: "Gerar CSV" },
};

/**
 * One dialog for every bulk action — the kit models these as a single
 * parameterised modal, and five near-identical components would drift apart.
 *
 * Each body carries the consequence in plain Portuguese: these actions touch
 * personal data, and the audit trail we promise only means something if the
 * user knew what they were confirming.
 */
export function ContactBulkActionDialog({
  action,
  selectedCount,
  tagOptions,
  ownerOptions,
  onClose,
  onConfirm,
}: IContactBulkActionDialogProps) {
  const [value, setValue] = useState("");

  // Reset the choice whenever a different action opens, so a tag picked last
  // time is never silently reused for the next one.
  useEffect(() => {
    if (!action) return;
    if (action === "export") setValue("selected");
    else if (action === "transferOwner") setValue(ownerOptions[0]?.id ?? UNASSIGN);
    else if (action === "addTag" || action === "removeTag") setValue(tagOptions[0] ?? "");
    else setValue("");
  }, [action, ownerOptions, tagOptions]);

  if (!action) return null;
  const copy = COPY[action];
  const needsValue = action !== "optOut";
  const scopeLabel = `${selectedCount} ${selectedCount === 1 ? "contato selecionado" : "contatos selecionados"}`;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon icon={copy.icon} size={18} className="text-primary" />
            {copy.title}
          </DialogTitle>
          <DialogDescription>{scopeLabel}</DialogDescription>
        </DialogHeader>

        {(action === "addTag" || action === "removeTag") && (
          <div className="space-y-2">
            <Label htmlFor="contact-bulk-tag">Etiqueta</Label>
            <Select value={value} onValueChange={setValue}>
              <SelectTrigger id="contact-bulk-tag">
                <SelectValue placeholder="Escolher" />
              </SelectTrigger>
              <SelectContent>
                {tagOptions.map((tag) => (
                  <SelectItem key={tag} value={tag}>
                    {tag}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {action === "addTag"
                ? "Aplicada a todos os contatos selecionados."
                : "Removida apenas de quem tiver a etiqueta."}
            </p>
          </div>
        )}

        {action === "transferOwner" && (
          <div className="space-y-2">
            <Label htmlFor="contact-bulk-owner">Novo responsável</Label>
            <Select value={value} onValueChange={setValue}>
              <SelectTrigger id="contact-bulk-owner">
                <SelectValue placeholder="Escolher" />
              </SelectTrigger>
              <SelectContent>
                {ownerOptions.map((owner) => (
                  <SelectItem key={owner.id} value={owner.id}>
                    {owner.name}
                  </SelectItem>
                ))}
                <SelectItem value={UNASSIGN}>Sem responsável</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex gap-2 rounded-md border border-border bg-muted/40 p-3">
              <Icon icon="mdi:information-outline" size={16} className="shrink-0 text-primary" />
              <p className="text-xs text-muted-foreground">
                A transferência move o contato, não a carteira do cliente. Fica registrada na
                auditoria.
              </p>
            </div>
          </div>
        )}

        {action === "optOut" && (
          <div className="flex gap-2 rounded-md border border-severity-critical/40 bg-severity-critical/10 p-3">
            <Icon
              icon="mdi:shield-off-outline"
              size={18}
              className="shrink-0 text-severity-critical"
            />
            <p className="text-xs text-muted-foreground">
              Os contatos deixam de receber envio em massa e disparos automáticos. Conversas
              iniciadas por eles continuam funcionando. A ação fica registrada na auditoria com
              autor e data.
            </p>
          </div>
        )}

        {action === "export" && (
          <div className="space-y-2">
            <Label htmlFor="contact-bulk-scope">Escopo</Label>
            <Select value={value} onValueChange={setValue}>
              <SelectTrigger id="contact-bulk-scope">
                <SelectValue placeholder="Escolher" />
              </SelectTrigger>
              <SelectContent>
                {EXPORT_SCOPES.map((scope) => (
                  <SelectItem key={scope.id} value={scope.id}>
                    {scope.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              O CSV sai com as colunas visíveis. Exportação de dados pessoais é registrada na
              auditoria (LGPD).
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant={copy.destructive ? "destructive" : "default"}
            disabled={needsValue && !value}
            onClick={() => onConfirm(action, value)}
          >
            {copy.cta}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
