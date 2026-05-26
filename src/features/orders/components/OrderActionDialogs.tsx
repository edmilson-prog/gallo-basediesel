import { useEffect, useState } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Icon } from "@/components/Icon";

export type OrderDialogKind =
  | null
  | "markPaid"
  | "startFulfillment"
  | "ship"
  | "deliver"
  | "return"
  | "cancel"
  | "refund"
  | "invoice";

export interface IShipPayload {
  carrier: string;
  trackingCode: string;
}

export function MarkPaidDialog({
  open,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Marcar como pago?</AlertDialogTitle>
          <AlertDialogDescription>
            Esta ação confirma que o cliente efetuou o pagamento. Em seguida você poderá iniciar
            a separação. Na Fase 2, a confirmação virá automaticamente do gateway de pagamento.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Confirmar pagamento</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function StartFulfillmentDialog({
  open,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Iniciar separação?</AlertDialogTitle>
          <AlertDialogDescription>
            O pedido passará a "Em separação". Use esta etapa para mobilizar a logística interna
            antes do envio.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Voltar</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Iniciar separação</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function ShipDialog({
  open,
  initialCarrier,
  initialTracking,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  initialCarrier?: string;
  initialTracking?: string;
  onCancel: () => void;
  onConfirm: (payload: IShipPayload) => void;
}) {
  const [carrier, setCarrier] = useState(initialCarrier ?? "");
  const [trackingCode, setTracking] = useState(initialTracking ?? "");
  useEffect(() => {
    if (open) {
      setCarrier(initialCarrier ?? "");
      setTracking(initialTracking ?? "");
    }
  }, [open, initialCarrier, initialTracking]);
  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Marcar como enviado?</AlertDialogTitle>
          <AlertDialogDescription>
            Informe a transportadora e o código de rastreamento. Os dois campos são opcionais —
            podem ser preenchidos depois.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="ship-carrier" className="text-xs">
              Transportadora
            </Label>
            <Input
              id="ship-carrier"
              placeholder="Ex.: Mercúrio, Braspress, retirada local…"
              value={carrier}
              onChange={(e) => setCarrier(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ship-tracking" className="text-xs">
              Código de rastreamento
            </Label>
            <Input
              id="ship-tracking"
              placeholder="Ex.: ME123456789BR"
              value={trackingCode}
              onChange={(e) => setTracking(e.target.value)}
            />
          </div>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={() => onConfirm({ carrier, trackingCode })}>
            Confirmar envio
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function DeliverDialog({
  open,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Marcar como entregue?</AlertDialogTitle>
          <AlertDialogDescription>
            Confirme que o cliente recebeu o pedido. Se o pagamento já está confirmado, o ciclo
            será encerrado como "Concluído".
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Confirmar entrega</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function ReturnDialog({
  open,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  useEffect(() => {
    if (open) setReason("");
  }, [open]);
  const disabled = reason.trim().length === 0;
  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Registrar devolução?</AlertDialogTitle>
          <AlertDialogDescription>
            O pedido será marcado como devolvido e o pagamento como estornado. Refund manual é
            necessário no MVP — a integração com gateway chega na Fase 2.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-1.5 py-2">
          <Label htmlFor="return-reason" className="text-xs">
            Motivo da devolução <span className="text-destructive">*</span>
          </Label>
          <Textarea
            id="return-reason"
            placeholder="Ex.: Peça incompatível com o modelo do veículo do cliente…"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Voltar</AlertDialogCancel>
          <AlertDialogAction disabled={disabled} onClick={() => onConfirm(reason.trim())}>
            Confirmar devolução
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function CancelDialog({
  open,
  postPayment,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  /** Whether the payment was already confirmed — surfaces the refund warning. */
  postPayment: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  useEffect(() => {
    if (open) setReason("");
  }, [open]);
  const disabled = reason.trim().length === 0;
  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancelar pedido?</AlertDialogTitle>
          <AlertDialogDescription>
            Essa ação é definitiva — o status agregado passará a "Cancelado". Mantenha o motivo
            claro no histórico.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {postPayment && (
          <div className="flex gap-2 rounded-md border border-orange-500/30 bg-orange-500/5 p-3 text-xs text-orange-700 dark:text-orange-200">
            <Icon icon="mdi:alert-outline" size={16} className="mt-0.5 shrink-0" />
            <p>
              Pagamento já registrado: o refund deve ser feito manualmente. A automação completa
              chega na Fase 2.
            </p>
          </div>
        )}
        <div className="space-y-1.5 py-2">
          <Label htmlFor="cancel-reason" className="text-xs">
            Motivo do cancelamento <span className="text-destructive">*</span>
          </Label>
          <Textarea
            id="cancel-reason"
            placeholder="Ex.: Cliente desistiu — sem reposição imediata em estoque…"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Voltar</AlertDialogCancel>
          <AlertDialogAction disabled={disabled} onClick={() => onConfirm(reason.trim())}>
            Confirmar cancelamento
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function RefundDialog({
  open,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Registrar estorno?</AlertDialogTitle>
          <AlertDialogDescription>
            O pagamento será marcado como estornado. Integração com gateway está prevista para a
            Fase 2 — o refund efetivo ainda precisa ser feito manualmente.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Voltar</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Confirmar estorno</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function InvoiceDialog({
  open,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Gerar NF (placeholder)?</AlertDialogTitle>
          <AlertDialogDescription>
            Um número fiscal fake será gerado e gravado no pedido para uso interno. A emissão
            real via SEFAZ é uma integração planejada para a Fase 2.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Voltar</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Gerar NF</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
