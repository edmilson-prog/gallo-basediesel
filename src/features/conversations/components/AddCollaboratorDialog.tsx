import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ID, IConversation, ISeller } from "@/shared/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { useSellersProvider, useSettingsProvider, useWhatsAppAccountsProvider } from "@/providers/data";
import { useAuth } from "@/features/auth/useAuth";
import { resolveInviteCandidates } from "../engine/collaboratorCandidates";

export interface IAddCollaboratorDialogProps {
  conversation: Pick<IConversation, "id" | "storeId" | "assignedSellerId" | "whatsappAccountId">;
  existingCollaboratorIds: ID[];
  onAdd: (sellerId: ID) => Promise<void>;
}

/** Invite dialog for the "Colaboradores" section — staff/responsável only
 *  (gated by the caller via `useConversationCollaborators().canManage`). */
export function AddCollaboratorDialog({
  conversation,
  existingCollaboratorIds,
  onAdd,
}: IAddCollaboratorDialogProps) {
  const [open, setOpen] = useState(false);
  const [pendingId, setPendingId] = useState<ID | null>(null);
  const sellersProvider = useSellersProvider();
  const settingsProvider = useSettingsProvider();
  const whatsappAccountsProvider = useWhatsAppAccountsProvider();
  const { currentUser } = useAuth();

  const {
    data: sellers = [],
    isLoading: sellersLoading,
    isError: sellersError,
  } = useQuery({
    queryKey: ["sellers", "collaborator-candidates", conversation.storeId],
    queryFn: () => sellersProvider.list({ storeId: conversation.storeId, active: true }),
    enabled: open,
    staleTime: 5 * 60_000,
  });
  const {
    data: settings,
    isLoading: settingsLoading,
    isError: settingsError,
  } = useQuery({
    queryKey: ["settings", conversation.storeId],
    queryFn: () => settingsProvider.get(conversation.storeId),
    enabled: open,
    staleTime: 5 * 60_000,
  });
  const {
    data: accessRules = [],
    isLoading: rulesLoading,
    isError: rulesError,
  } = useQuery({
    queryKey: ["whatsapp-account-access-rules", conversation.whatsappAccountId],
    queryFn: () => whatsappAccountsProvider.getAccessRules(conversation.whatsappAccountId!),
    enabled: open && Boolean(conversation.whatsappAccountId),
    staleTime: 5 * 60_000,
  });
  const loading = sellersLoading || settingsLoading || rulesLoading;
  const hasError = sellersError || settingsError || rulesError;
  // Mirrors the narrowing branch in resolveInviteCandidates: with the store
  // flag OFF, only sellers who already access the instance can be invited.
  const instanceGateActive =
    Boolean(conversation.whatsappAccountId) && !settings?.participantCrossInstance;

  const candidates: ISeller[] = resolveInviteCandidates(sellers, {
    assignedSellerId: conversation.assignedSellerId,
    existingCollaboratorIds,
    currentSellerId: currentUser?.sellerId,
    whatsappAccountId: conversation.whatsappAccountId ?? null,
    crossInstanceAllowed: Boolean(settings?.participantCrossInstance),
    accessRules,
  });

  const handleSelect = async (sellerId: ID) => {
    setPendingId(sellerId);
    try {
      await onAdd(sellerId);
      setOpen(false);
    } catch {
      // The error toast is already surfaced by the mutation's onError
      // (useConversationCollaborators). Swallow here so the rejection doesn't
      // escape the `void handleSelect(...)` call site as an unhandledrejection
      // (which Sentry would report in prod). Keep the dialog open on failure.
    } finally {
      setPendingId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className="h-6 gap-1 px-1.5 text-[11px]">
          <Icon icon="mdi:account-plus-outline" size={13} />
          Adicionar colaborador
        </Button>
      </DialogTrigger>
      <DialogContent className="p-0">
        <DialogHeader className="px-4 pt-4">
          <DialogTitle>Adicionar colaborador</DialogTitle>
          <DialogDescription>
            O colaborador passa a ver e responder esta conversa, sem assumir a carteira do
            cliente.
          </DialogDescription>
        </DialogHeader>
        <Command>
          <CommandInput placeholder="Buscar vendedor..." />
          <CommandList>
            <CommandEmpty>
              {loading ? (
                "Carregando vendedores..."
              ) : hasError ? (
                <span className="block px-4 text-muted-foreground">
                  Não foi possível carregar os vendedores. Feche e abra novamente para tentar de
                  novo.
                </span>
              ) : candidates.length === 0 && instanceGateActive ? (
                <span className="block px-4 text-muted-foreground">
                  Nenhum vendedor com acesso a este número está disponível para convidar. Conceda
                  acesso ao número em Configurações → WhatsApp ou ative &ldquo;Convidados acessam
                  conversas de outras instâncias&rdquo;.
                </span>
              ) : (
                "Nenhum vendedor disponível para convidar."
              )}
            </CommandEmpty>
            <CommandGroup>
              {candidates.map((seller) => (
                <CommandItem
                  key={seller.id}
                  value={seller.fullName}
                  disabled={pendingId !== null}
                  onSelect={() => void handleSelect(seller.id)}
                >
                  <Avatar className="mr-2 h-5 w-5">
                    <AvatarFallback className="bg-secondary text-[9px] font-semibold text-secondary-foreground">
                      {seller.fullName.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  {seller.fullName}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
