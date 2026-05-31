import { useCustomerAuth } from "../hooks/useCustomerAuth";
import { useSeoMeta } from "@/features/storefront/hooks/useSeoMeta";
import { NotificationPreferences } from "@/features/notifications/components/NotificationPreferences";
import { STOREFRONT_ACCOUNT_STRINGS as S } from "../i18n/pt-BR";

export function AccountNotificationPreferencesPage() {
  const { customer } = useCustomerAuth();
  useSeoMeta({ title: "Preferências de aviso · GALLO PARTS" });

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          {S.notificationPrefsTitle}
        </h1>
        <p className="text-sm text-muted-foreground">{S.notificationPrefsSubtitle}</p>
      </header>
      {customer && (
        <NotificationPreferences
          recipientId={customer.id}
          recipientType="customer"
          audience="customer"
        />
      )}
    </div>
  );
}
