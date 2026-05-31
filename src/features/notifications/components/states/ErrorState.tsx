import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";

interface ErrorStateProps {
  onRetry: () => void;
}

export function NotificationsErrorState({ onRetry }: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
      <Icon icon="mdi:alert-circle-outline" size={40} className="text-muted-foreground/50" />
      <p className="text-sm text-muted-foreground">Não foi possível carregar as notificações.</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        Tentar novamente
      </Button>
    </div>
  );
}
