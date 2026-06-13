import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { IWhatsAppAccount } from "@/shared/types";
import {
  avatarSyncErrorMessage,
  emptyAvatarSyncStats,
  runAvatarSync,
  type IAvatarSyncStats,
} from "../api/whatsappAvatarSync";

type Phase = "confirm" | "running" | "done" | "error";

/**
 * Owner-only contact photo sync driver: confirm → batched progress → summary.
 * Server-side idempotency makes "Tentar de novo" safe — only contacts that were
 * never attempted are processed, so a re-run resumes where it stopped.
 */
export function SyncAvatarsDialog({
  account,
  onClose,
}: {
  account: IWhatsAppAccount | null;
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("confirm");
  const [stats, setStats] = useState<IAvatarSyncStats>(emptyAvatarSyncStats());
  const [batches, setBatches] = useState(0);
  const [errorText, setErrorText] = useState("");
  const runningRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (account) {
      setPhase("confirm");
      setStats(emptyAvatarSyncStats());
      setBatches(0);
      setErrorText("");
    }
  }, [account?.id]);

  const start = async () => {
    if (!account || runningRef.current) return;
    runningRef.current = true;
    setPhase("running");
    try {
      const total = await runAvatarSync(account.id, (progress) => {
        if (!mountedRef.current) return;
        setStats(progress.total);
        setBatches(progress.batches);
      });
      if (!mountedRef.current) return;
      setStats(total);
      setPhase("done");
    } catch (error) {
      if (!mountedRef.current) return;
      setErrorText(avatarSyncErrorMessage(error));
      setPhase("error");
    } finally {
      runningRef.current = false;
    }
  };

  const close = () => {
    if (phase === "running") return; // never abandon a run silently
    onClose();
  };

  return (
    <Dialog open={account !== null} onOpenChange={(open) => !open && close()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Sincronizar fotos dos contatos</DialogTitle>
          <DialogDescription>
            {account
              ? `Conta ${account.label} — busca no WhatsApp a foto de perfil de cada contato e a exibe nas Conversas.`
              : ""}
          </DialogDescription>
        </DialogHeader>

        {phase === "confirm" && (
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>
              Para cada contato, buscamos a foto de perfil pública no WhatsApp e a guardamos com
              segurança. Contatos sem foto ou com foto privada continuam com o avatar de iniciais.
            </p>
            <p>
              Pode levar alguns minutos com muitos contatos — o progresso aparece aqui. Pode rodar
              mais de uma vez: só processa quem ainda não foi sincronizado.
            </p>
          </div>
        )}

        {(phase === "running" || phase === "done") && (
          <div className="space-y-3">
            {phase === "running" && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Icon icon="mdi:loading" size={16} className="animate-spin" />
                Sincronizando… lote {batches}
              </div>
            )}
            <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
              <dt className="text-muted-foreground">Contatos processados</dt>
              <dd className="text-right font-medium text-foreground">{stats.processed}</dd>
              <dt className="text-muted-foreground">Fotos encontradas</dt>
              <dd className="text-right font-medium text-severity-success">{stats.withPhoto}</dd>
              <dt className="text-muted-foreground">Sem foto pública</dt>
              <dd className="text-right font-medium text-foreground">{stats.withoutPhoto}</dd>
              {stats.failed > 0 && (
                <>
                  <dt className="text-severity-warning">Com falha (tentar de novo)</dt>
                  <dd className="text-right font-medium text-severity-warning">{stats.failed}</dd>
                </>
              )}
            </dl>
            {phase === "done" && (
              <p className="flex items-center gap-1.5 text-sm text-severity-success">
                <Icon icon="mdi:check-circle-outline" size={16} />
                {stats.withPhoto > 0
                  ? `Sincronização concluída — ${stats.withPhoto} foto(s) já aparecem nas Conversas.`
                  : "Sincronização concluída — nenhum contato tinha foto de perfil pública."}
              </p>
            )}
          </div>
        )}

        {phase === "error" && (
          <div className="space-y-2">
            <p className="flex items-start gap-1.5 text-sm text-severity-critical">
              <Icon icon="mdi:alert-circle-outline" size={16} className="mt-0.5 shrink-0" />
              {errorText}
            </p>
            <p className="text-xs text-muted-foreground">
              O que já foi sincronizado está salvo — tentar de novo continua de onde parou.
            </p>
          </div>
        )}

        <DialogFooter>
          {phase === "confirm" && (
            <>
              <Button variant="outline" onClick={close}>
                Cancelar
              </Button>
              <Button onClick={() => void start()}>
                <Icon icon="mdi:account-multiple-outline" size={14} className="mr-1.5" />
                Sincronizar agora
              </Button>
            </>
          )}
          {phase === "running" && (
            <Button disabled>
              <Icon icon="mdi:loading" size={14} className="mr-1.5 animate-spin" />
              Sincronizando…
            </Button>
          )}
          {phase === "done" && <Button onClick={close}>Fechar</Button>}
          {phase === "error" && (
            <>
              <Button variant="outline" onClick={close}>
                Fechar
              </Button>
              <Button onClick={() => void start()}>Tentar de novo</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
