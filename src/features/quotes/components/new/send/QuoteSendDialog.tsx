// src/features/quotes/components/new/send/QuoteSendDialog.tsx
import { useEffect, useState } from "react";
import type { ICustomer, ID, ILead, IWhatsAppAccount } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { getCustomerName } from "@/features/customers/utils/customerDisplay";

const moneyFormatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

export interface IQuoteSendChannels {
  whatsapp: boolean;
  email: boolean;
  /** Instance the WhatsApp message goes out from. */
  accountId: ID | null;
  /** Recipient address — starts as the customer's, editable. */
  emailTo: string;
  /** Note that goes ahead of the quote in both channels. */
  message: string;
}

export interface IQuoteSendDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: ICustomer | null;
  lead: ILead | null;
  /** Connected instances the seller may send from. */
  accounts: IWhatsAppAccount[];
  total: number;
  /** `YYYY-MM-DD`, for the greeting. */
  validUntil: string;
  submitting: boolean;
  onConfirm: (channels: IQuoteSendChannels) => void;
  /** Opens the preview of the document being sent. */
  onPreview: () => void;
}

function firstName(customer: ICustomer | null, lead: ILead | null): string {
  const full = customer ? getCustomerName(customer) : (lead?.name ?? "");
  return full.split(" ")[0] ?? "";
}

function formatValidUntil(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime()) ? "" : dateFormatter.format(d);
}

/**
 * Where the quote goes when it is sent, and with what words. Both channels are
 * opt-in per send and each states its own destination, because "Salvar e
 * enviar" used to mean only "mark as sent" — the seller could not see, let
 * alone choose, what would actually leave the building.
 */
export function QuoteSendDialog({
  open,
  onOpenChange,
  customer,
  lead,
  accounts,
  total,
  validUntil,
  submitting,
  onConfirm,
  onPreview,
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
  const [message, setMessage] = useState("");

  // Re-seed each time it opens: recipient and total may have changed meanwhile.
  useEffect(() => {
    if (!open) return;
    const valid = formatValidUntil(validUntil);
    const name = firstName(customer, lead);
    setWhatsapp(canWhatsApp);
    setEmail(Boolean(defaultEmail));
    setEmailTo(defaultEmail);
    setAccountId((current) => current ?? accounts[0]?.id ?? null);
    setMessage(
      `Olá${name ? `, ${name}` : ""}! Segue o orçamento no valor de ${moneyFormatter.format(total)}` +
        `${valid ? `, válido até ${valid}` : ""}. Qualquer dúvida, estou à disposição.`,
    );
  }, [open, canWhatsApp, defaultEmail, accounts, customer, lead, total, validUntil]);

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTo.trim());
  const chosen = [whatsapp ? "WhatsApp" : null, email ? "E-mail" : null].filter(Boolean);
  const blocked =
    chosen.length === 0 || (email && !emailValid) || (whatsapp && !accountId) || submitting;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle>Salvar e enviar</DialogTitle>
          <DialogDescription>
            O orçamento é salvo e enviado pelos canais marcados. Nada sai sem a sua confirmação.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-w-0 flex-col gap-3.5">
          <div className="min-w-0">
            <Label className="text-[10px] uppercase tracking-wider">Enviar por</Label>
            <div className="mt-1.5 flex flex-col gap-1.5">
              <div
                className={`flex items-center gap-2.5 rounded-lg border px-2.5 py-2 ${
                  whatsapp && canWhatsApp ? "border-primary/40" : "border-border"
                } ${canWhatsApp ? "" : "opacity-60"}`}
              >
                <Checkbox
                  checked={whatsapp && canWhatsApp}
                  disabled={!canWhatsApp}
                  onCheckedChange={(v) => setWhatsapp(v === true)}
                  aria-label="Enviar por WhatsApp"
                />
                <Icon
                  icon="mdi:whatsapp"
                  size={15}
                  className={canWhatsApp ? "text-severity-success" : "text-muted-foreground"}
                />
                <span className="w-16 shrink-0 text-xs font-medium text-foreground">WhatsApp</span>
                <span className="min-w-0 flex-1 truncate font-semicond text-[12px] text-muted-foreground">
                  {canWhatsApp
                    ? `${phone} — cai na conversa do cliente`
                    : !customer
                      ? "só para cliente cadastrado"
                      : !phone
                        ? "sem telefone cadastrado"
                        : "nenhuma instância conectada"}
                </span>
              </div>

              {canWhatsApp && whatsapp && accounts.length > 1 && (
                <Select value={accountId ?? ""} onValueChange={(v) => setAccountId(v as ID)}>
                  <SelectTrigger className="h-8 text-xs" aria-label="Instância de envio">
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

              <div
                className={`flex items-center gap-2.5 rounded-lg border px-2.5 py-2 ${
                  email ? "border-primary/40" : "border-border"
                }`}
              >
                <Checkbox
                  checked={email}
                  onCheckedChange={(v) => setEmail(v === true)}
                  aria-label="Enviar por e-mail"
                />
                <Icon icon="mdi:email-outline" size={15} className="text-info" />
                <span className="w-16 shrink-0 text-xs font-medium text-foreground">E-mail</span>
                <Input
                  type="email"
                  value={emailTo}
                  onChange={(e) => setEmailTo(e.target.value)}
                  placeholder={
                    defaultEmail ? "nome@empresa.com.br" : "sem e-mail cadastrado — digite um"
                  }
                  aria-label="E-mail do destinatário"
                  className="h-7 min-w-0 flex-1 border-0 bg-transparent px-0 text-xs shadow-none focus-visible:ring-0"
                />
              </div>
              {email && emailTo.trim().length > 0 && !emailValid && (
                <p className="text-[11px] text-severity-critical">Endereço de e-mail inválido.</p>
              )}
            </div>
          </div>

          <div>
            <Label htmlFor="quote-send-message" className="text-[10px] uppercase tracking-wider">
              Mensagem
            </Label>
            <Textarea
              id="quote-send-message"
              rows={3}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="mt-1.5 text-[13px]"
            />
          </div>

          <div className="flex items-center gap-2.5 rounded-lg border border-border px-2.5 py-2">
            <Icon icon="mdi:file-document-outline" size={15} className="shrink-0 text-primary" />
            <span className="min-w-0 flex-1 truncate text-xs text-foreground">
              Orçamento{customer ? ` — ${getCustomerName(customer)}` : ""}
            </span>
            <span className="hidden shrink-0 font-semicond text-[11.5px] text-muted-foreground sm:inline">
              vai no corpo da mensagem
            </span>
            <Button type="button" variant="ghost" size="sm" onClick={onPreview}>
              <Icon icon="mdi:eye-outline" size={14} />
              ver
            </Button>
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-2 border-t border-border pt-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-xs text-muted-foreground">
              Total <b className="tabular-nums text-foreground">{moneyFormatter.format(total)}</b>
            </span>
            <span className="font-semicond text-[11px] text-muted-foreground">
              o número do orçamento é gerado ao salvar
            </span>
          </div>
          <div className="flex min-w-0 justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              className="shrink-0"
              disabled={submitting}
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              className="min-w-0"
              disabled={blocked}
              onClick={() =>
                onConfirm({
                  whatsapp: whatsapp && canWhatsApp,
                  email,
                  accountId,
                  emailTo: emailTo.trim(),
                  message: message.trim(),
                })
              }
            >
              {submitting ? (
                <>
                  <Icon
                    icon="mdi:loading"
                    size={16}
                    className="animate-spin motion-reduce:animate-none"
                  />
                  Enviando…
                </>
              ) : (
                <>
                  <Icon icon="mdi:send-outline" size={16} className="shrink-0" />
                  <span className="truncate">
                    Salvar e enviar{chosen.length > 0 ? ` (${chosen.join(" + ")})` : ""}
                  </span>
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
