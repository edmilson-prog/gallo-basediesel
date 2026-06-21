import { Icon } from "@/components/Icon";
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
import { Progress } from "@/components/ui/progress";

interface ISessionTimeoutModalProps {
  open: boolean;
  secondsLeft: number;
  /** Total da janela de aviso, em segundos — base da barra de progresso. */
  totalSeconds: number;
  onStayConnected: () => void;
  onLogoutNow: () => void;
}

function formatClock(seconds: number): string {
  const s = Math.max(0, seconds);
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

/** Idle-timeout warning with a live countdown. Not dismissible by overlay/Esc. */
export function SessionTimeoutModal({
  open,
  secondsLeft,
  totalSeconds,
  onStayConnected,
  onLogoutNow,
}: ISessionTimeoutModalProps) {
  const critical = secondsLeft <= 10;
  const pct = totalSeconds > 0 ? Math.max(0, Math.min(100, (secondsLeft / totalSeconds) * 100)) : 0;
  return (
    <AlertDialog open={open}>
      <AlertDialogContent
        onEscapeKeyDown={(e) => e.preventDefault()}
        className="max-w-md"
      >
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Icon
              icon="mdi:clock-alert-outline"
              size={20}
              className={critical ? "text-severity-critical" : "text-severity-warning"}
            />
            Sua sessão será encerrada
          </AlertDialogTitle>
          <AlertDialogDescription>
            Detectamos inatividade. Por segurança, sua sessão será encerrada
            automaticamente. Clique em <strong>Continuar conectado</strong> para
            permanecer.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="flex flex-col items-center gap-3 py-2">
          <span
            aria-live="assertive"
            className={
              critical
                ? "text-5xl font-bold tabular-nums text-severity-critical"
                : "text-5xl font-bold tabular-nums text-foreground"
            }
          >
            {formatClock(secondsLeft)}
          </span>
          <Progress value={pct} className="w-full" />
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel onClick={onLogoutNow}>Sair agora</AlertDialogCancel>
          <AlertDialogAction onClick={onStayConnected}>Continuar conectado</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
