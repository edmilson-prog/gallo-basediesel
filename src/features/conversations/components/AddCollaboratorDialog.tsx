import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ID, IConversation, ISeller } from "@/shared/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { useSellersProvider, useSettingsProvider, useWhatsAppAccountsProvider } from "@/providers/data";
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

  const { data: sellers = [] } = useQuery({
    queryKey: ["sellers", "collaborator-candidates", conversation.storeId],
    queryFn: () => sellersProvider.list({ storeId: conversation.storeId, active: true }),
    enabled: open,
    staleTime: 5 * 60_000,
  });
  const { data: settings } = useQuery({
    queryKey: ["settings", conversation.storeId],
    queryFn: () => settingsProvider.get(conversation.storeId),
    enabled: open,
    staleTime: 5 * 60_000,
  });
  const { data: accessRules = [] } = useQuery({
    queryKey: ["whatsapp-account-access-rules", conversation.whatsappAccountId],
    queryFn: () => whatsappAccountsProvider.getAccessRules(conversation.whatsappAccountId!),
    enabled: open && Boolean(conversation.whatsappAccountId),
    staleTime: 5 * 60_000,
  });

  const candidates: ISeller[] = resolveInviteCandidates(sellers, {
    assignedSellerId: conversation.assignedSellerId,
    existingCollaboratorIds,
    whatsappAccountId: conversation.whatsappAccountId ?? null,
    crossInstanceAllowed: Boolean(settings?.participantCrossInstance),
    accessRules,
  });

  const handleSelect = async (sellerId: ID) => {
    setPendingId(sellerId);
    try {
      await onAdd(sellerId);
      setOpen(false);
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
        </DialogHeader>
        <Command>
          <CommandInput placeholder="Buscar vendedor..." />
          <CommandList>
            <CommandEmpty>Nenhum vendedor disponível para convidar.</CommandEmpty>
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
