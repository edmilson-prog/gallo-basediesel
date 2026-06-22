import { useEffect, useRef, useState, type RefObject } from "react";
import { toast } from "sonner";
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
import { Skeleton } from "@/components/ui/skeleton";
import type { IWhatsAppAccount } from "@/shared/types";
import {
  connectErrorMessage,
  deleteEvolutionInstance,
  preflightDeleteEvolution,
  type IDeletePreflight,
} from "../api/whatsappConnect";

const PROVIDER_LABEL: Record<IWhatsAppAccount["provider"], string> = {
  evolution: "Evolution API",
  meta: "Meta Cloud API",
};

interface IDeleteInstanceDialogProps {
  account: IWhatsAppAccount | null;
  onClose: () => void;
  onDeleted: () => void;
  /** Opens the connection/disconnect flow for a blocked instance. */
  onDisconnect: (account: IWhatsAppAccount) => void;
  /** Stable element to focus after a successful delete (the card that opened the
   *  dialog is gone, so Radix would otherwise drop focus to <body>). */
  restoreFocusRef?: RefObject<HTMLElement | null>;
}

/**
 * Page-level confirmation for deleting a WhatsApp instance. Runs the server
 * preflight on open and self-branches: an empty instance gets a destructive
 * confirm; one with linked data gets an explanatory dialog that routes to
 * "Desconectar" instead. Rendered once at page scope, controlled by `account`.
 */
export function DeleteInstanceDialog({
  account,
  onClose,
  onDeleted,
  onDisconnect,
  restoreFocusRef,
}: IDeleteInstanceDialogProps) {
  const [preflight, setPreflight] = useState<IDeletePreflight | null>(null);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // onClose is an inline arrow in the parent (new identity each render). Keep it
  // in a ref so the preflight effect keys on `account` alone — otherwise every
  // parent re-render (30s status polling, metrics) would re-run the preflight
  // and flash the dialog back to its loading state.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!account) {
      setPreflight(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setPreflight(null);
    preflightDeleteEvolution(account.id)
      .then((result) => {
        if (!cancelled) setPreflight(result);
      })
      .catch((err) => {
        if (cancelled) return;
        toast.error(connectErrorMessage(err));
        onCloseRef.current();
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [account]);

  if (!account) return null;

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteEvolutionInstance(account.id);
      toast.success(`Instância "${account.label}" excluída.`);
      onDeleted();
      onClose();
      // The card that opened this dialog is now removed; move focus to a stable
      // landmark after Radix's unmount restore (which would land on <body>).
      setTimeout(() => restoreFocusRef?.current?.focus(), 0);
    } catch (err) {
      // Race: linked data arrived after preflight → refresh + close (retry is futile).
      const code = (err as { code?: string }).code;
      if (code === "HAS_LINKED_DATA") {
        toast.error(connectErrorMessage(err));
        onDeleted();
        onClose();
      } else {
        toast.error("Não foi possível excluir a instância. Tente novamente.");
      }
    } finally {
      setDeleting(false);
    }
  };

  const blocked = preflight !== null && !preflight.deletable;

  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open && !deleting) onClose();
      }}
    >
      <AlertDialogContent>
        {loading || !preflight ? (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>Verificando a instância…</AlertDialogTitle>
              <AlertDialogDescription>
                Conferindo se "{account.label}" pode ser excluída com segurança.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-4/5" />
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
            </AlertDialogFooter>
          </>
        ) : blocked ? (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>Esta instância não pode ser excluída</AlertDialogTitle>
              <AlertDialogDescription>
                A instância "{account.label}" tem dados vinculados. A exclusão só é permitida em
                instâncias vazias (de teste). Para parar de enviar e receber por este número sem
                perder o histórico, use Desconectar.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-1.5 rounded-md border border-severity-warning/40 bg-severity-warning/10 p-3 text-sm text-severity-warning">
              {preflight.conversationCount > 0 && (
                <p className="flex items-center gap-2">
                  <Icon icon="mdi:message-text-outline" size={15} />
                  {preflight.conversationCount}{" "}
                  {preflight.conversationCount === 1 ? "conversa vinculada" : "conversas vinculadas"}
                </p>
              )}
              {preflight.templateCount > 0 && (
                <p className="flex items-center gap-2">
                  <Icon icon="mdi:file-document-outline" size={15} />
                  {preflight.templateCount}{" "}
                  {preflight.templateCount === 1 ? "template de mensagem" : "templates de mensagem"}
                </p>
              )}
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel>Fechar</AlertDialogCancel>
              {/* "Desconectar" only helps a CONNECTED Evolution instance — for a
                  Meta account (no QR flow) or an already-disconnected one it would
                  route to a dead-end connect/QR screen, so it's hidden there. */}
              {account.provider === "evolution" && account.status === "connected" && (
                <AlertDialogAction
                  onClick={(e) => {
                    e.preventDefault();
                    const target = account;
                    onClose();
                    onDisconnect(target);
                  }}
                >
                  <Icon icon="mdi:logout-variant" size={15} className="mr-1.5" />
                  Desconectar
                </AlertDialogAction>
              )}
            </AlertDialogFooter>
          </>
        ) : (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir a instância "{account.label}"?</AlertDialogTitle>
              <AlertDialogDescription>
                {account.phoneNumber} · {PROVIDER_LABEL[account.provider]}
              </AlertDialogDescription>
            </AlertDialogHeader>

            <div className="space-y-3 text-sm">
              <ul className="space-y-1.5 text-muted-foreground">
                {account.provider === "evolution" && (
                  <li className="flex items-start gap-2">
                    <Icon icon="mdi:server-off" size={15} className="mt-0.5 shrink-0" />
                    <span>
                      A instância no servidor Evolution
                      {account.providerConfig?.instanceName
                        ? ` (${account.providerConfig.instanceName})`
                        : ""}{" "}
                      será desconectada e apagada.
                    </span>
                  </li>
                )}
                <li className="flex items-start gap-2">
                  <Icon
                    icon="mdi:card-account-details-outline"
                    size={15}
                    className="mt-0.5 shrink-0"
                  />
                  <span>O cadastro da conta nesta tela será excluído.</span>
                </li>
                <li className="flex items-start gap-2">
                  <Icon icon="mdi:cog-outline" size={15} className="mt-0.5 shrink-0" />
                  <span>As configurações de acesso, cor e failover desta instância.</span>
                </li>
              </ul>

              <p className="text-xs text-muted-foreground">
                Conversas vinculadas: {preflight.conversationCount} · Templates:{" "}
                {preflight.templateCount}
              </p>

              {preflight.failoverDependents.length > 0 && (
                <div className="rounded-md border border-severity-warning/40 bg-severity-warning/10 p-3 text-severity-warning">
                  <p className="flex items-center gap-2 font-medium">
                    <Icon icon="mdi:swap-horizontal" size={15} />
                    Outra(s) conta(s) usam esta como reserva de failover:
                  </p>
                  <ul className="mt-1 list-disc pl-6">
                    {preflight.failoverDependents.map((d) => (
                      <li key={d.id}>{d.label}</li>
                    ))}
                  </ul>
                  <p className="mt-1">Ao excluir, o failover será desativado nessas contas.</p>
                </div>
              )}

              <p className="font-medium text-destructive">
                Esta ação é permanente e não pode ser desfeita.
              </p>
            </div>

            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                disabled={deleting}
                onClick={(e) => {
                  e.preventDefault(); // keep the dialog open while deleting / on error
                  void handleDelete();
                }}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                <Icon
                  icon={deleting ? "mdi:loading" : "mdi:trash-can-outline"}
                  size={15}
                  className={`mr-1.5 ${deleting ? "animate-spin" : ""}`}
                />
                {deleting ? "Excluindo…" : "Excluir instância"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}
