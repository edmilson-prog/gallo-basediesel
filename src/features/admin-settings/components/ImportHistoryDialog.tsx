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
  goHistoryErrorMessage,
  landGoHistory,
  prepareGoHistory,
  undoGoHistory,
  WhatsAppGoHistoryError,
  type IGoHistoryAggregateStats,
  type IGoHistoryLandStats,
  type IGoHistoryUndoResult,
} from "../api/whatsappImportHistory";

export type HistoryDialogMode = "import" | "undo";

type Phase = "confirm" | "preparing" | "landing" | "running" | "done" | "error";

const emptyAgg: IGoHistoryAggregateStats = {
  individualChats: 0,
  lidResolved: 0,
  lidUnresolved: 0,
  groups: 0,
  broadcasts: 0,
  totalMessages: 0,
};
const emptyLand: IGoHistoryLandStats = {
  customersCreated: 0,
  conversationsCreated: 0,
  messagesImported: 0,
  messagesSkipped: 0,
};

/**
 * Owner-only Evolution Go history import. `import` mode: confirm → prepare
 * (distill captured chunks) → land in cursored batches with a progress bar →
 * summary. `undo` mode: confirm → remove exactly what was landed. Re-running an
 * import is safe (dedup by provider_message_id).
 */
export function ImportHistoryDialog({
  account,
  mode,
  onClose,
}: {
  account: IWhatsAppAccount | null;
  mode: HistoryDialogMode;
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("confirm");
  const [agg, setAgg] = useState<IGoHistoryAggregateStats>(emptyAgg);
  const [total, setTotal] = useState(0);
  const [landed, setLanded] = useState(0);
  const [landStats, setLandStats] = useState<IGoHistoryLandStats>(emptyLand);
  const [undoResult, setUndoResult] = useState<IGoHistoryUndoResult>({
    removedMessages: 0,
    removedConversations: 0,
  });
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
      setAgg(emptyAgg);
      setTotal(0);
      setLanded(0);
      setLandStats(emptyLand);
      setUndoResult({ removedMessages: 0, removedConversations: 0 });
      setErrorText("");
    }
    // Reset state only when the target account/mode changes, never on parent re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account?.id, mode]);

  const runImport = async () => {
    if (!account) return;
    setPhase("preparing");
    const prep = await prepareGoHistory(account.id);
    if (!mountedRef.current) return;
    setAgg(prep.stats);
    setTotal(prep.total);
    if (prep.total === 0) {
      setPhase("done");
      return;
    }
    setPhase("landing");
    const acc: IGoHistoryLandStats = { ...emptyLand };
    let landedSoFar = 0;
    // Bounded loop: total/BATCH iterations + slack; stall is caught explicitly.
    for (let guard = 0; guard < prep.total + 100; guard++) {
      const res = await landGoHistory(account.id);
      if (!mountedRef.current) return;
      landedSoFar += res.landed;
      acc.customersCreated += res.stats.customersCreated;
      acc.conversationsCreated += res.stats.conversationsCreated;
      acc.messagesImported += res.stats.messagesImported;
      acc.messagesSkipped += res.stats.messagesSkipped;
      setLanded(landedSoFar);
      setLandStats({ ...acc });
      if (res.done) return;
      if (res.landed === 0 && res.remaining > 0) {
        throw new WhatsAppGoHistoryError(
          "Alguns itens falharam ao importar. Tente de novo para retomar de onde parou.",
        );
      }
    }
  };

  const runUndo = async () => {
    if (!account) return;
    setPhase("running");
    const result = await undoGoHistory(account.id);
    if (!mountedRef.current) return;
    setUndoResult(result);
    setPhase("done");
  };

  const start = async () => {
    if (!account || runningRef.current) return;
    runningRef.current = true;
    try {
      if (mode === "import") await runImport();
      else await runUndo();
      if (mountedRef.current && mode === "import") setPhase("done");
    } catch (error) {
      if (mountedRef.current) {
        setErrorText(goHistoryErrorMessage(error));
        setPhase("error");
      }
    } finally {
      runningRef.current = false;
    }
  };

  const busy = phase === "preparing" || phase === "landing" || phase === "running";
  const close = () => {
    if (busy) return; // never abandon a run silently
    onClose();
  };

  const pct = total > 0 ? Math.min(100, Math.round((landed / total) * 100)) : 0;
  const title = mode === "import" ? "Importar histórico de conversas" : "Desfazer importação";

  return (
    <Dialog open={account !== null} onOpenChange={(open) => !open && close()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{account ? `Conta ${account.label}` : ""}</DialogDescription>
        </DialogHeader>

        {phase === "confirm" && mode === "import" && (
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>
              Traz para o Inbox as conversas do histórico capturado no pareamento. As conversas caem
              na <strong>fila (sem responsável)</strong> — quem opera o número assume.
            </p>
            <p>
              Contatos com número oculto (<code className="font-mono text-xs">@lid</code>) são
              resgatados quando o WhatsApp fornece o mapeamento; grupos e listas são ignorados.
            </p>
            <p>
              Só o <strong>texto/legenda</strong> é importado (mídia não é baixada). Cada contato
              novo entra como contato <code className="font-mono text-xs">pending_review</code> — não
              aparece em Clientes até revisão; a conversa vai para o Inbox. Pode rodar mais de uma
              vez: nada é duplicado.
            </p>
          </div>
        )}

        {phase === "confirm" && mode === "undo" && (
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>
              Remove <strong>exatamente</strong> as mensagens e conversas que esta importação criou
              para esta conta. Conversas e mensagens que chegaram ao vivo não são tocadas.
            </p>
            <p>
              Os contatos criados (<code className="font-mono text-xs">pending_review</code>)
              permanecem como pendentes (fora da lista de Clientes até a revisão).
            </p>
          </div>
        )}

        {(phase === "preparing" || phase === "landing") && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Icon icon="mdi:loading" size={16} className="animate-spin" />
              {phase === "preparing" ? "Preparando o histórico capturado…" : `Importando… ${pct}%`}
            </div>
            {phase === "landing" && (
              <>
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {landed} de {total} conversas · {landStats.messagesImported} mensagens
                </p>
              </>
            )}
          </div>
        )}

        {phase === "running" && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Icon icon="mdi:loading" size={16} className="animate-spin" />
            Desfazendo a importação…
          </div>
        )}

        {phase === "done" && mode === "import" && (
          <div className="space-y-3">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
              <dt className="text-muted-foreground">Conversas importadas</dt>
              <dd className="text-right font-medium text-foreground">
                {landStats.conversationsCreated}
              </dd>
              <dt className="text-muted-foreground">Mensagens</dt>
              <dd className="text-right font-medium text-foreground">
                {landStats.messagesImported}
              </dd>
              <dt className="text-muted-foreground">Contatos novos (pendentes)</dt>
              <dd className="text-right font-medium text-foreground">
                {landStats.customersCreated}
              </dd>
              <dt className="text-muted-foreground">Resgatadas de @lid</dt>
              <dd className="text-right font-medium text-foreground">{agg.lidResolved}</dd>
            </dl>
            <p
              className={`flex items-center gap-1.5 text-sm ${
                total > 0 ? "text-severity-success" : "text-severity-warning"
              }`}
            >
              <Icon
                icon={total > 0 ? "mdi:check-circle-outline" : "mdi:information-outline"}
                size={16}
              />
              {total > 0
                ? "Importação concluída. As conversas estão no Inbox (fila), filtre pela instância."
                : "Nenhum histórico capturado para esta conta — re-pareie a instância para capturar."}
            </p>
          </div>
        )}

        {phase === "done" && mode === "undo" && (
          <p className="flex items-center gap-1.5 text-sm text-severity-success">
            <Icon icon="mdi:check-circle-outline" size={16} />
            Importação desfeita — {undoResult.removedMessages} mensagens e{" "}
            {undoResult.removedConversations} conversas removidas.
          </p>
        )}

        {phase === "error" && (
          <p className="flex items-start gap-1.5 text-sm text-severity-critical">
            <Icon icon="mdi:alert-circle-outline" size={16} className="mt-0.5 shrink-0" />
            {errorText}
          </p>
        )}

        <DialogFooter>
          {phase === "confirm" && (
            <>
              <Button variant="outline" onClick={close}>
                Cancelar
              </Button>
              <Button
                variant={mode === "undo" ? "destructive" : "default"}
                onClick={() => void start()}
              >
                <Icon
                  icon={mode === "undo" ? "mdi:undo-variant" : "mdi:history"}
                  size={14}
                  className="mr-1.5"
                />
                {mode === "undo" ? "Desfazer importação" : "Importar agora"}
              </Button>
            </>
          )}
          {busy && (
            <Button disabled>
              <Icon icon="mdi:loading" size={14} className="mr-1.5 animate-spin" />
              {mode === "undo" ? "Desfazendo…" : "Importando…"}
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
