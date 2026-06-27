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
  contactsImportErrorMessage,
  emptyContactsImportStats,
  runContactsImport,
  type IContactsImportStats,
} from "../api/whatsappImportContacts";

type Phase = "confirm" | "running" | "done" | "error";

/**
 * Owner-only Evolution Go contacts import: confirm → run → summary. Single shot
 * (the list is bounded — no batching). Re-running is safe: existing customers
 * are never duplicated. Imports the CONTACT LIST, not conversations.
 */
export function ImportContactsDialog({
  account,
  onClose,
}: {
  account: IWhatsAppAccount | null;
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("confirm");
  const [stats, setStats] = useState<IContactsImportStats>(emptyContactsImportStats());
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
      setStats(emptyContactsImportStats());
      setErrorText("");
    }
  }, [account?.id]);

  const start = async () => {
    if (!account || runningRef.current) return;
    runningRef.current = true;
    setPhase("running");
    try {
      const total = await runContactsImport(account.id);
      if (!mountedRef.current) return;
      setStats(total);
      setPhase("done");
    } catch (error) {
      if (!mountedRef.current) return;
      setErrorText(contactsImportErrorMessage(error));
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
          <DialogTitle>Importar contatos do WhatsApp</DialogTitle>
          <DialogDescription>
            {account
              ? `Conta ${account.label} — traz a lista de contatos do WhatsApp para a base de Clientes.`
              : ""}
          </DialogDescription>
        </DialogHeader>

        {phase === "confirm" && (
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>
              Cada contato que ainda não é cliente entra como <strong>cliente pendente</strong> (tag{" "}
              <code className="font-mono text-xs">pending_review</code>) para revisão depois.
            </p>
            <p>
              Grupos, listas, canais e contatos com número oculto são ignorados. Isto traz a{" "}
              <strong>lista de contatos</strong> — não as conversas.
            </p>
            <p>Pode rodar mais de uma vez: nada é duplicado.</p>
          </div>
        )}

        {(phase === "running" || phase === "done") && (
          <div className="space-y-3">
            {phase === "running" && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Icon icon="mdi:loading" size={16} className="animate-spin" />
                Importando contatos…
              </div>
            )}
            <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
              <dt className="text-muted-foreground">Contatos encontrados</dt>
              <dd className="text-right font-medium text-foreground">{stats.contactsFound}</dd>
              <dt className="text-muted-foreground">Clientes novos (revisar)</dt>
              <dd className="text-right font-medium text-foreground">{stats.customersCreated}</dd>
              <dt className="text-muted-foreground">Já existiam</dt>
              <dd className="text-right font-medium text-foreground">{stats.customersExisting}</dd>
              {stats.failed > 0 && (
                <>
                  <dt className="text-severity-warning">Falhas</dt>
                  <dd className="text-right font-medium text-severity-warning">{stats.failed}</dd>
                </>
              )}
            </dl>
            {phase === "done" && (
              <p
                className={`flex items-center gap-1.5 text-sm ${
                  stats.failed > 0 ? "text-severity-warning" : "text-severity-success"
                }`}
              >
                <Icon
                  icon={stats.failed > 0 ? "mdi:alert-circle-outline" : "mdi:check-circle-outline"}
                  size={16}
                />
                {stats.customersCreated > 0
                  ? `Importação concluída — ${stats.customersCreated} novo(s) cliente(s) em Clientes (tag pending_review).`
                  : "Importação concluída — nenhum contato novo (todos já eram clientes)."}
              </p>
            )}
          </div>
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
              <Button onClick={() => void start()}>
                <Icon icon="mdi:account-multiple-plus-outline" size={14} className="mr-1.5" />
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
