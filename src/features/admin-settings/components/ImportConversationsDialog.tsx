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
  emptyImportStats,
  importErrorMessage,
  runHistoryImport,
  type IImportStats,
} from "../api/whatsappImport";

type Phase = "confirm" | "running" | "done" | "error";

/**
 * Owner-only history import driver (real-inbox spec §4): confirm → batched
 * progress → summary. Server-side idempotency makes "Tentar de novo" safe —
 * the import resumes where it stopped.
 */
export function ImportConversationsDialog({
  account,
  onClose,
}: {
  account: IWhatsAppAccount | null;
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("confirm");
  const [stats, setStats] = useState<IImportStats>(emptyImportStats());
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
      setStats(emptyImportStats());
      setBatches(0);
      setErrorText("");
    }
  }, [account?.id]);

  const start = async () => {
    if (!account || runningRef.current) return;
    runningRef.current = true;
    setPhase("running");
    try {
      const total = await runHistoryImport(account.id, (progress) => {
        if (!mountedRef.current) return;
        setStats(progress.total);
        setBatches(progress.batches);
      });
      if (!mountedRef.current) return;
      setStats(total);
      setPhase("done");
    } catch (error) {
      if (!mountedRef.current) return;
      setErrorText(importErrorMessage(error));
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
          <DialogTitle>Importar conversas do WhatsApp</DialogTitle>
          <DialogDescription>
            {account
              ? `Conta ${account.label} — traz para o Inbox o histórico que o ${
                  account.provider === "waha" ? "servidor WAHA" : "servidor Evolution"
                } tem armazenado.`
              : ""}
          </DialogDescription>
        </DialogHeader>

        {phase === "confirm" && (
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>
              Números que ainda não são clientes entram como <strong>contatos pendentes</strong>{" "}
              (tag <code className="font-mono text-xs">pending_review</code>) — não aparecem em
              Clientes até revisão; a conversa vai para o Inbox.
            </p>
            <p>
              Grupos, listas, canais e contatos com número oculto pelo WhatsApp são ignorados.
              Mídias antigas não são baixadas.
            </p>
            <p>Pode rodar mais de uma vez: nada é duplicado.</p>
          </div>
        )}

        {(phase === "running" || phase === "done") && (
          <div className="space-y-3">
            {phase === "running" && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Icon icon="mdi:loading" size={16} className="animate-spin" />
                Importando… lote {batches}
              </div>
            )}
            <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
              <dt className="text-muted-foreground">Conversas processadas</dt>
              <dd className="text-right font-medium text-foreground">{stats.chatsProcessed}</dd>
              <dt className="text-muted-foreground">Conversas novas criadas</dt>
              <dd className="text-right font-medium text-foreground">
                {stats.conversationsCreated}
              </dd>
              <dt className="text-muted-foreground">Mensagens importadas</dt>
              <dd className="text-right font-medium text-foreground">{stats.messagesImported}</dd>
              <dt className="text-muted-foreground">Contatos novos (pendentes)</dt>
              <dd className="text-right font-medium text-foreground">{stats.customersCreated}</dd>
              <dt className="text-muted-foreground">Grupos ignorados</dt>
              <dd className="text-right font-medium text-foreground">{stats.chatsSkippedGroup}</dd>
              {stats.chatsSkippedLid > 0 && (
                <>
                  <dt className="text-muted-foreground">Contatos com número oculto</dt>
                  <dd className="text-right font-medium text-foreground">
                    {stats.chatsSkippedLid}
                  </dd>
                </>
              )}
              {stats.chatsSkippedBroadcast > 0 && (
                <>
                  <dt className="text-muted-foreground">Listas e canais ignorados</dt>
                  <dd className="text-right font-medium text-foreground">
                    {stats.chatsSkippedBroadcast}
                  </dd>
                </>
              )}
              {stats.chatsSkippedOther > 0 && (
                <>
                  <dt className="text-muted-foreground">Outros ignorados</dt>
                  <dd className="text-right font-medium text-foreground">
                    {stats.chatsSkippedOther}
                  </dd>
                </>
              )}
              <dt className="text-muted-foreground">Já existiam (puladas)</dt>
              <dd className="text-right font-medium text-foreground">{stats.messagesSkipped}</dd>
              {stats.chatsFailed > 0 && (
                <>
                  <dt className="text-severity-warning">Conversas com falha</dt>
                  <dd className="text-right font-medium text-severity-warning">
                    {stats.chatsFailed}
                  </dd>
                </>
              )}
            </dl>
            {phase === "done" && (
              <p
                className={`flex items-center gap-1.5 text-sm ${
                  stats.chatsFailed > 0 ? "text-severity-warning" : "text-severity-success"
                }`}
              >
                <Icon
                  icon={
                    stats.chatsFailed > 0 ? "mdi:alert-circle-outline" : "mdi:check-circle-outline"
                  }
                  size={16}
                />
                {stats.chatsFailed > 0
                  ? `Importação concluída — ${stats.chatsFailed} conversa(s) falharam e podem ser reimportadas (tente de novo).`
                  : "Importação concluída — as conversas já estão no Inbox."}
              </p>
            )}
            {phase === "done" && stats.chatsSkippedLid > 0 && (
              <p className="text-xs text-muted-foreground">
                Contatos com número oculto são conversas individuais cujo número o WhatsApp não
                revela (privacidade). Ainda não entram no Inbox — não são grupos.
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
              O que já foi importado está salvo — tentar de novo continua de onde parou.
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
                <Icon icon="mdi:download-multiple" size={14} className="mr-1.5" />
                Importar agora
              </Button>
            </>
          )}
          {phase === "running" && (
            <Button disabled>
              <Icon icon="mdi:loading" size={14} className="mr-1.5 animate-spin" />
              Importando…
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
