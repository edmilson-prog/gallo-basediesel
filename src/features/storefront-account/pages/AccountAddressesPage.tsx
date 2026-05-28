import { useState } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/Icon";
import { useSeoMeta } from "@/features/storefront/hooks/useSeoMeta";
import { useCustomerAuth } from "../hooks/useCustomerAuth";
import { useCustomerAuthStore, type ICustomerSavedAddress } from "../store/customerAuthStore";
import { AddressFormModal, type IAddressFormValue } from "../components/AddressFormModal";
import { STOREFRONT_ACCOUNT_STRINGS as S } from "../i18n/pt-BR";

export function AccountAddressesPage() {
  const { customer } = useCustomerAuth();
  const addresses = useCustomerAuthStore((s) =>
    customer ? (s.savedAddresses[customer.id] ?? []) : [],
  );
  const addSavedAddress = useCustomerAuthStore((s) => s.addSavedAddress);
  const updateSavedAddress = useCustomerAuthStore((s) => s.updateSavedAddress);
  const removeSavedAddress = useCustomerAuthStore((s) => s.removeSavedAddress);
  const setDefaultAddress = useCustomerAuthStore((s) => s.setDefaultAddress);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ICustomerSavedAddress | undefined>();

  useSeoMeta({ title: "Endereços · GALLO PARTS" });

  if (!customer) return null;

  const openCreate = () => {
    setEditing(undefined);
    setModalOpen(true);
  };

  const openEdit = (address: ICustomerSavedAddress) => {
    setEditing(address);
    setModalOpen(true);
  };

  const handleSubmit = (value: IAddressFormValue) => {
    const { label, ...address } = value;
    if (editing) {
      updateSavedAddress(customer.id, editing.id, { ...address, label });
    } else {
      addSavedAddress(customer.id, { ...address, label });
    }
    toast.success(S.addressesSavedToast);
    setModalOpen(false);
    setEditing(undefined);
  };

  const handleRemove = (address: ICustomerSavedAddress) => {
    if (!window.confirm(S.addressesRemoveConfirm)) return;
    removeSavedAddress(customer.id, address.id);
    toast.success(S.addressesRemovedToast);
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
            {S.addressesTitle}
          </h1>
          <p className="text-sm text-muted-foreground">{S.addressesSubtitle}</p>
        </div>
        <Button onClick={openCreate}>
          <Icon icon="mdi:plus" size={16} className="mr-1" aria-hidden />
          {S.addressesAddCta}
        </Button>
      </header>

      {addresses.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 p-10 text-center">
          <Icon icon="mdi:map-marker-off-outline" size={36} className="text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{S.addressesEmpty}</p>
          <Button variant="default" onClick={openCreate}>
            {S.addressesEmptyCta}
          </Button>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {addresses.map((address) => (
            <Card key={address.id} className="space-y-3 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {address.label ?? `${address.city}/${address.state}`}
                    </p>
                    {address.isDefault && (
                      <Badge
                        variant="outline"
                        className="border-primary/40 text-[10px] text-primary"
                      >
                        {S.addressesDefaultBadge}
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {address.street}, {address.number}
                    {address.complement ? ` — ${address.complement}` : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {address.district} · {address.city}/{address.state} · CEP {address.zipCode}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {!address.isDefault && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDefaultAddress(customer.id, address.id)}
                  >
                    <Icon icon="mdi:star-outline" size={14} className="mr-1" aria-hidden />
                    {S.addressesMakeDefaultCta}
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => openEdit(address)}>
                  <Icon icon="mdi:pencil-outline" size={14} className="mr-1" aria-hidden />
                  {S.addressesEditCta}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => handleRemove(address)}
                >
                  <Icon icon="mdi:trash-can-outline" size={14} className="mr-1" aria-hidden />
                  {S.addressesRemoveCta}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <AddressFormModal
        open={modalOpen}
        initial={editing}
        onClose={() => {
          setModalOpen(false);
          setEditing(undefined);
        }}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
