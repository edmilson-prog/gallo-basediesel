import { useAuth } from "@/features/auth/useAuth";
import { NotificationPreferences } from "../components/NotificationPreferences";

/**
 * Internal notification preferences page (mounted under /app/configuracoes).
 * The recipient is the authenticated staff member (seller).
 */
export function NotificationPreferencesPage() {
  const { currentUser } = useAuth();
  const recipientId = currentUser?.sellerId ?? currentUser?.id ?? "";

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-display text-2xl font-bold leading-tight">Notificações</h1>
        <p className="text-sm text-muted-foreground">
          Escolha como e quando você recebe cada tipo de aviso.
        </p>
      </header>
      {recipientId ? (
        <NotificationPreferences recipientId={recipientId} recipientType="seller" />
      ) : (
        <p className="text-sm text-muted-foreground">Não foi possível identificar seu usuário.</p>
      )}
    </div>
  );
}
