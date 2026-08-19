// src/features/quotes/components/new/send/QuoteSendDialog.tsx
import { useEffect, useState } from "react";
import type { ICustomer, ID, ILead, IWhatsAppAccount } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface IQuoteSendChannels {
  whatsapp: boolean;
  email: boolean;
  /** Instance the WhatsApp message goes out from. */
  accountId: ID | null;
  /** Recipient address — starts as the customer's, editable. */
  emailTo: string;
}

export interface IQuoteSendDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: ICustomer | null;
  lead: ILead | null;
  /** Connected instances the seller may send from. */
  accounts: IWhatsAppAccount[];
  submitting: boolean;
  onConfirm: (channels: IQuoteSendChannels) => void;
}

/**
 * Where the quote goes when it is sent. Both channels are opt-in per send and
 * each one states its own destination, because "Salvar e enviar" used to mean
 * only "mark as sent" — the seller had no way to see, let alone choose, what
 * would actually leave the building.
 */
export function QuoteSendDialog({
  open,
  onOpenChange,
  customer,
  lead,
  accounts,
  submitting,
  onConfirm,
}: IQuoteSendDialogProps) {
  const phone = customer?.phone ?? lead?.phone ?? "";
  const defaultEmail = customer?.email ?? "";
  // A lead has no customer row, and an outbound thread is opened against a
  // customer — so WhatsApp only lights up for a real customer.
  const canWhatsApp = Boolean(customer && phone && accounts.length > 0);

  const [whatsapp, setWhatsapp] = useState(canWhatsApp);
  const [email, setEmail] = useState(Boolean(defaultEmail));
  const [emailTo, setEmailTo] = useState(defaultEmail);
  const [accountId, setAccountId] = useState<ID | null>(accounts[0]?.id ?? null);

  // Re-seed each time it opens: the recipient may have changed meanwhile.
  useEffect(() => {
    if (!open) return;
    setWhatsapp(canWhatsApp);
    setEmail(Boolean(defaultEmail));
    setEmailTo(defaultEmail);
    setAccountId((current) => current ?? accounts[0]?.id ?? null);
  }, [open, canWhatsApp, defaultEmail, accounts]);

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTo.trim());
  const nothingChosen = !whatsapp && !email;
  const blocked = nothingChosen || (email && !emailValid) || (whatsapp && !accountId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Enviar orçamento</DialogTitle>
          <DialogDescription>
            O orçamento é salvo e enviado pelos canais marcados. Nada sai sem a sua confirmação.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <label
            className={`flex gap-3 rounded-lg border p-3 ${
              canWhatsApp ? "border-border" : "border-border/60 opacity-60"
            }`}
          >
            <Checkbox
              checked={whatsapp}
              disabled={!canWhatsApp}
              onCheckedChange={(v) => setWhatsapp(v === true)}
              aria-label="Enviar por WhatsApp"
              className="mt-0.5"
            />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                <Icon icon="mdi:whatsapp" size={16} className="text-severity-success" />
                WhatsApp
              </p>
              {canWhatsApp ? (
                <>
                  <p className="font-semicond text-[11.5px] text-muted-foreground">
                    Para {phone} — entra na conversa do cliente na Inbox.
                  </p>
                  {accounts.length > 1 && whatsapp && (
                    <Select value={accountId ?? ""} onValueChange={(v) => setAccountId(v as ID)}>
                      <SelectTrigger className="mt-2 h-8 text-xs" aria-label="Instância de envio">
                        <SelectValue placeholder="Escolha a instância" />
                      </SelectTrigger>
                      <SelectContent>
                        {accounts.map((account) => (
                          <SelectItem key={account.id} value={account.id}>
                            {account.label} · {account.phoneNumber}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </>
              ) : (
                <p className="font-semicond text-[11.5px] text-muted-foreground">
                  {!customer
                    ? "Disponível para cliente cadastrado — um lead ainda não tem conversa própria."
                    : !phone
                      ? "Este cliente não tem telefone cadastrado."
                      : "Nenhuma instância do WhatsApp conectada e disponível para você."}
                </p>
              )}
            </div>
          </label>

          <div className="flex gap-3 rounded-lg border border-border p-3">
            <Checkbox
              checked={email}
              onCheckedChange={(v) => setEmail(v === true)}
              aria-label="Enviar por e-mail"
              className="mt-0.5"
            />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                <Icon icon="mdi:email-outline" size={16} className="text-info" />
                E-mail
              </p>
              {email ? (
                <div className="mt-2">
                  <Label
                    htmlFor="quote-send-email"
                    className="text-[10px] uppercase tracking-wider"
                  >
                    Destinatário
                  </Label>
                  <Input
                    id="quote-send-email"
                    type="email"
                    className="mt-1 h-8 text-xs"
                    value={emailTo}
                    onChange={(e) => setEmailTo(e.target.value)}
                    placeholder="cliente@empresa.com.br"
                  />
                  {!emailValid && emailTo.trim().length > 0 && (
                    <p className="mt-1 text-[11px] text-severity-critical">
                      Endereço de e-mail inválido.
                    </p>
                  )}
                </div>
              ) : (
                <p className="font-semicond text-[11.5px] text-muted-foreground">
                  {defaultEmail
                    ? `Para ${defaultEmail} — com o orçamento no corpo da mensagem.`
                    : "Este cliente não tem e-mail cadastrado; marque para informar um."}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2">
          {nothingChosen && (
            <span className="mr-auto text-[11px] text-muted-foreground">
              Marque ao menos um canal.
            </span>
          )}
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={blocked || submitting}
            onClick={() => onConfirm({ whatsapp, email, accountId, emailTo: emailTo.trim() })}
          >
            <Icon icon="mdi:send-outline" size={16} />
            Salvar e enviar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
