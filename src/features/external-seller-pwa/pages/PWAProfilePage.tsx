import { useNavigate } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { usePwaAuth } from "../hooks/usePwaAuth";
import { PWABanner } from "../components/PWABanner";
import { PWA_STRINGS as S } from "../i18n/pt-BR";

export function PWAProfilePage() {
  const navigate = useNavigate();
  const { session, logout } = usePwaAuth();

  const handleLogout = () => {
    logout();
    void navigate({ to: "/pwa/login" });
  };

  return (
    <div className="space-y-4">
      <h1 className="font-display text-xl font-semibold text-foreground">{S.profileTitle}</h1>

      <Card className="flex items-center gap-3 p-4">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-lg font-semibold text-primary-foreground">
          {(session?.sellerName ?? "?").slice(0, 2).toUpperCase()}
        </span>
        <div>
          <p className="font-medium text-foreground">{session?.sellerName ?? "—"}</p>
          <p className="text-xs text-muted-foreground">
            {S.profileStore}: {session?.storeId ?? "—"}
          </p>
        </div>
      </Card>

      <PWABanner text={S.offlineBanner} />

      <Button variant="outline" className="h-12 w-full" onClick={handleLogout}>
        <Icon icon="mdi:logout" size={18} className="mr-1.5" aria-hidden />
        {S.profileLogout}
      </Button>
    </div>
  );
}
