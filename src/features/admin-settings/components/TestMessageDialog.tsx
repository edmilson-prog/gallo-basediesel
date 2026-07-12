import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Icon } from "@/components/Icon";
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
import { Label } from "@/components/ui/label";
import type { IWhatsAppAccount } from "@/shared/types";
import {
  connectErrorMessage,
  formatTestPhoneMask,
  normalizeTestPhoneDigits,
  sendEvolutionTestMessage,
} from "../api/whatsappConnect";
import { sendWahaTestMessage } from "../api/wahaConnect";

/**
 * Ad-hoc test send for a connected Evolution or WAHA account (SIGPRO-inspired):
 * validates the pairing end-to-end without touching the Inbox — the edge
 * sends through the real engine but never persists a conversation message.
 */
export function TestMessageDialog({
  account,
  onClose,
}: {
  account: IWhatsAppAccount | null;
  onClose: () => void;
}) {
  const [number, setNumber] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (account) {
      setNumber("");
      setSending(false);
    }
  }, [account]);

  /** Masked input: deleting a separator must consume the digit before it. */
  const handleNumberChange = (raw: string) => {
    const digits = raw.replace(/\D/g, "");
    const prevDigits = number.replace(/\D/g, "");
    const next = raw.length < number.length && digits === prevDigits ? digits.slice(0, -1) : digits;
    setNumber(formatTestPhoneMask(next));
  };

  const handleSend = async () => {
    if (!account) return;
    const digits = normalizeTestPhoneDigits(number);
    if (!digits) {
      toast.error("Informe o número com DDI e DDD — ex.: 5554999887766.");
      return;
    }
    setSending(true);
    try {
      if (account.provider === "waha") {
        await sendWahaTestMessage(account.id, digits);
      } else {
        await sendEvolutionTestMessage(account.id, digits);
      }
      toast.success("Mensagem de teste enviada. Confira o celular de destino.");
      onClose();
    } catch (err) {
      toast.error(
        account.provider === "waha"
          ? err instanceof Error
            ? err.message
            : "Não foi possível enviar a mensagem de teste."
          : connectErrorMessage(err),
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={Boolean(account)} onOpenChange={(open) => !open && !sending && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Mensagem de teste — {account?.label}</DialogTitle>
          <DialogDescription>
            Envia um texto padrão pelo número conectado, validando a conexão de ponta a ponta. Não
            aparece na Central de Atendimento.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor="test-message-number">Número de destino</Label>
          <Input
            id="test-message-number"
            className="font-mono"
            placeholder="+55 54 99988-7766"
            inputMode="numeric"
            autoComplete="off"
            value={number}
            onChange={(e) => handleNumberChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleSend();
            }}
            disabled={sending}
            autoFocus
          />
          <p className="text-[11px] text-muted-foreground">
            Digite só os números, com DDI e DDD (ex.: 5554999887766) — a máscara é aplicada
            automaticamente.
          </p>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={sending}>
            Cancelar
          </Button>
          <Button onClick={() => void handleSend()} disabled={sending}>
            {sending ? (
              <Icon icon="mdi:loading" size={14} className="mr-1.5 animate-spin" />
            ) : (
              <Icon icon="mdi:send" size={14} className="mr-1.5" />
            )}
            Enviar teste
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
