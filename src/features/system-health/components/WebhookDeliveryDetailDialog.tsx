import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import type { IWebhookDelivery } from "@/shared/types";
import { SYSTEM_HEALTH_STRINGS as S } from "../i18n/pt-BR";

export function WebhookDeliveryDetailDialog({
  delivery,
  onClose,
}: {
  delivery: IWebhookDelivery | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={delivery !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[85dvh] max-w-2xl flex-col overflow-hidden p-0">
        <DialogHeader className="flex shrink-0 flex-row items-center justify-between space-y-0 border-b border-border px-4 py-3">
          <DialogTitle className="text-sm">{S.webhooksDetailTitle}</DialogTitle>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onClose} aria-label={S.webhooksClose}>
            <Icon icon="mdi:close" size={18} />
          </Button>
        </DialogHeader>
        {delivery && (
          <div className="min-h-0 flex-1 overflow-auto p-4 text-xs">
            {delivery.errorMessage && (
              <p className="mb-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-destructive">
                <strong>{S.webhooksDetailError}:</strong> {delivery.errorMessage}
              </p>
            )}
            <pre className="whitespace-pre-wrap break-all rounded-md bg-muted p-3 font-mono">
              {JSON.stringify(delivery.requestPayload, null, 2)}
            </pre>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
