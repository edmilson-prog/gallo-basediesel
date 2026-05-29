import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCNPJ } from "@/shared/utils/format";
import { useCustomersProvider } from "@/providers/data";
import { auditLog } from "@/features/rbac/utils/auditLog";
import { usePortalSession } from "../hooks/usePortalSession";
import { PORTAL_STRINGS as S } from "../i18n/pt-BR";

export function PortalProfilePage() {
  const { user, customer, isLoadingCustomer } = usePortalSession();
  const provider = useCustomersProvider();

  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [contactName, setContactName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!customer) return;
    setPhone(customer.phone);
    setEmail(customer.email ?? "");
    setContactName(customer.type === "B2B" ? customer.contactName : "");
  }, [customer]);

  if (isLoadingCustomer || !customer) {
    return <Skeleton className="h-48 w-full" />;
  }

  const isAdmin = user?.role === "admin";

  const handleSave = async () => {
    setSaving(true);
    try {
      const patch = customer.type === "B2B" ? { phone, email, contactName } : { phone, email };
      await provider.update(customer.id, patch);
      auditLog({
        actorId: user?.id,
        action: "portal_profile_update",
        resource: "customer",
        resourceId: customer.id,
        after: { phone, email },
        storeId: "store-matriz",
      });
      toast.success(S.profileSaved);
    } catch {
      toast.error("Falha ao salvar.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="font-display text-2xl font-semibold text-foreground">{S.profileTitle}</h1>

      <Card className="space-y-4 p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Razão social</Label>
            <Input
              value={customer.type === "B2B" ? customer.razaoSocial : customer.fullName}
              disabled
            />
          </div>
          <div className="space-y-1.5">
            <Label>CNPJ</Label>
            <Input value={customer.type === "B2B" ? formatCNPJ(customer.cnpj) : "—"} disabled />
          </div>
          {customer.type === "B2B" && (
            <div className="space-y-1.5">
              <Label htmlFor="p-contact">Contato</Label>
              <Input
                id="p-contact"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                disabled={!isAdmin}
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="p-phone">Telefone</Label>
            <Input
              id="p-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={!isAdmin}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="p-email">E-mail</Label>
            <Input
              id="p-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={!isAdmin}
            />
          </div>
        </div>

        {customer.address && (
          <div className="space-y-1.5">
            <Label>Endereço fiscal</Label>
            <Input
              value={`${customer.address.street}, ${customer.address.number} — ${customer.address.district}, ${customer.address.city}/${customer.address.state}`}
              disabled
            />
          </div>
        )}

        {isAdmin && (
          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Salvando…" : S.profileSave}
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
