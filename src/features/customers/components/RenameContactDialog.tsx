import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ICustomer } from "@/shared/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCustomersProvider } from "@/providers/data/hooks/useCustomersProvider";
import { getCustomerName } from "../utils/customerDisplay";
import { CUSTOMER_STRINGS } from "../i18n/pt-BR";

export interface IRenameContactDialogProps {
  customer: ICustomer;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fired after a successful rename so the caller can refetch its own view. */
  onRenamed?: () => void;
}

/**
 * Renames the customer's DISPLAY name in the platform — `fullName` (B2C) or
 * `nomeFantasia` (B2B), the same field `getCustomerName` reads. Persists through
 * `provider.renameContact`, which resolves the variant field from the row's own
 * `type` server-side and is gated (SECURITY DEFINER RPC) so a non-staff seller
 * attending a POOL contact can rename it — and writes the audit trail there.
 * Self-contained: it runs the rename, cache invalidation and toast, so callers
 * only open it.
 */
export function RenameContactDialog({
  customer,
  open,
  onOpenChange,
  onRenamed,
}: IRenameContactDialogProps) {
  const provider = useCustomersProvider();
  const queryClient = useQueryClient();
  const currentName = getCustomerName(customer);
  const whatsappName = customer.whatsappName;
  const [name, setName] = useState(currentName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Seed the field with the current name whenever the dialog (re)opens or the
  // contact changes — the component instance is reused across conversations.
  useEffect(() => {
    if (open) {
      setName(currentName);
      setError(null);
    }
  }, [open, currentName]);

  const handleConfirm = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError(CUSTOMER_STRINGS.rename.empty);
      return;
    }
    if (trimmed === currentName) {
      onOpenChange(false);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      // Gated server-side (SECURITY DEFINER RPC) so a non-staff seller attending
      // a POOL contact can rename it — the direct customers UPDATE is RLS-blocked
      // off their carteira. The RPC resolves fullName/nomeFantasia from the row
      // and writes the audit trail server-side (bypasses RLS, may act cross-carteira).
      await provider.renameContact(customer.id, trimmed);
      void queryClient.invalidateQueries({ queryKey: ["customer-profile", customer.id] });
      void queryClient.invalidateQueries({ queryKey: ["customers-list"] });
      toast.success(CUSTOMER_STRINGS.rename.success);
      onRenamed?.();
      onOpenChange(false);
    } catch {
      toast.error(CUSTOMER_STRINGS.rename.failed);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{CUSTOMER_STRINGS.rename.title}</DialogTitle>
          <DialogDescription>{CUSTOMER_STRINGS.rename.description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="rename-contact-input">{CUSTOMER_STRINGS.rename.label}</Label>
          <Input
            id="rename-contact-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={CUSTOMER_STRINGS.rename.placeholder}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void handleConfirm();
              }
            }}
          />
          {error && <p className="text-xs text-destructive">{error}</p>}

          {whatsappName && (
            <div className="flex items-center justify-between gap-2 rounded-md bg-muted/50 px-3 py-2 text-xs">
              <span className="min-w-0 truncate text-muted-foreground">
                {CUSTOMER_STRINGS.rename.whatsappNameLabel}:{" "}
                <span className="font-medium text-foreground">{whatsappName}</span>
              </span>
              {whatsappName !== name.trim() && (
                <button
                  type="button"
                  onClick={() => setName(whatsappName)}
                  className="shrink-0 font-medium text-primary hover:underline"
                >
                  {CUSTOMER_STRINGS.rename.useWhatsappName}
                </button>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {CUSTOMER_STRINGS.rename.cancel}
          </Button>
          <Button onClick={() => void handleConfirm()} disabled={saving}>
            {CUSTOMER_STRINGS.rename.confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
