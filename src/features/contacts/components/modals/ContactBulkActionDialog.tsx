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
import { Input } from "@/components/ui/input";
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
  /**
   * Who the action hits, already worded: a contact's name when it came from the
   * card menu or the drawer, "N contatos selecionados" when it came from the
   * bulk bar. The dialog must never assume the current selection — a single
   * contact acted on from its own menu is usually not selected at all.
   */
  targetLabel: string;
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
  targetLabel,
  tagOptions,
  ownerOptions,
  onClose,
  onConfirm,
}: IContactBulkActionDialogProps) {
  const [value, setValue] = useState("");

  // Reset the choice whenever a different action opens, so a tag picked last
  // time is never silently reused for the next one. `addTag` starts empty
  // because it is free text — the agenda has to be able to mint its first tag.
  useEffect(() => {
    if (!action) return;
    if (action === "export") setValue("selected");
    else if (action === "transferOwner") setValue(ownerOptions[0]?.id ?? UNASSIGN);
    else if (action === "removeTag") setValue(tagOptions[0] ?? "");
    else setValue("");
  }, [action, ownerOptions, tagOptions]);

  if (!action) return null;
  const copy = COPY[action];
  const needsValue = action !== "optOut";

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon icon={copy.icon} size={18} className="text-primary" />
            {copy.title}
          </DialogTitle>
          <DialogDescription>{targetLabel}</DialogDescription>
        </DialogHeader>

        {action === "addTag" && (
          <div className="space-y-2">
            <Label htmlFor="contact-bulk-tag">Etiqueta</Label>
            <Input
              id="contact-bulk-tag"
              value={value}
              maxLength={40}
              autoComplete="off"
              placeholder="Ex.: Frota, Comprador, Pós-venda"
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && value.trim()) onConfirm(action, value.trim());
              }}
            />
            {tagOptions.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                <span className="text-xs text-muted-foreground">Já usadas:</span>
                {tagOptions.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => setValue(tag)}
                    className="rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
                  >
                    {tag}
                  </button>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Aplicada a todos os contatos do escopo acima. Etiqueta nova é criada na hora.
            </p>
          </div>
        )}

        {action === "removeTag" && (
          <div className="space-y-2">
            <Label htmlFor="contact-bulk-tag">Etiqueta</Label>
            {tagOptions.length > 0 ? (
              <>
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
                  Removida apenas de quem tiver a etiqueta.
                </p>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">
                Nenhuma etiqueta em uso nos contatos carregados. Não há o que remover.
              </p>
            )}
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
            disabled={needsValue && !value.trim()}
            onClick={() => onConfirm(action, value.trim())}
          >
            {copy.cta}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
