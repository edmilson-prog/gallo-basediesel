import { useState } from "react";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
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
import { ProfileSettingRow } from "./ProfileSettingRow";

interface IProfileDangerZoneProps {
  /** False in the mock backend — there is no server session to revoke. */
  enabled: boolean;
  busy: boolean;
  onSignOutEverywhere: () => void;
}

/**
 * Danger zone — global sign-out. Revokes every session, including this one, so
 * it always goes through an explicit confirmation.
 */
export function ProfileDangerZone({ enabled, busy, onSignOutEverywhere }: IProfileDangerZoneProps) {
  const [confirming, setConfirming] = useState(false);

  return (
    <section className="overflow-hidden rounded-xl border border-severity-critical/35 bg-card">
      <header className="flex items-center gap-2 border-b border-severity-critical/25 bg-severity-critical/5 px-5 py-3">
        <Icon icon="lucide:triangle-alert" className="size-4 text-severity-critical" />
        <h2 className="text-sm font-semibold text-foreground">Zona de perigo</h2>
      </header>
      <div className="px-5 py-1">
        <ProfileSettingRow
          icon="lucide:log-out"
          tone="critical"
          title="Sair de todos os dispositivos"
          description={
            enabled
              ? "Encerra todas as sessões, inclusive esta. Você precisará entrar novamente."
              : "Disponível apenas com a autenticação real (modo Produção)."
          }
          right={
            <Button
              variant="outline"
              size="sm"
              disabled={!enabled || busy}
              onClick={() => setConfirming(true)}
              className="border-severity-critical/45 text-severity-critical hover:bg-severity-critical/10 hover:text-severity-critical"
            >
              {busy ? "Encerrando…" : "Encerrar tudo"}
            </Button>
          }
          last
        />
      </div>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Encerrar todas as sessões?</AlertDialogTitle>
            <AlertDialogDescription>
              Você será desconectado deste e de todos os outros dispositivos e precisará entrar
              novamente com sua senha.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={onSignOutEverywhere}>Encerrar tudo</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
