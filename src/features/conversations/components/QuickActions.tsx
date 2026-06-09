import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Can } from "@/features/rbac/components/Can";
import { useAuth } from "@/features/auth/useAuth";
import { usePermission } from "@/features/rbac/hooks/usePermission";
import { recordAuditLog, useConversationsProvider, useSellersProvider } from "@/providers/data";
import type { IConversation, ISeller } from "@/shared/types";
import { INBOX_STRINGS } from "../i18n/pt-BR";

export interface IQuickActionsProps {
  conversation: IConversation;
  onMutated?: () => void;
}

function showUndoableToast(message: string, undo: () => Promise<void> | void) {
  toast(message, {
    action: {
      label: INBOX_STRINGS.undo,
      onClick: () => {
        void Promise.resolve(undo())
          .then(() => toast.success(INBOX_STRINGS.undone))
          .catch(() => toast.error(INBOX_STRINGS.actionFailed));
      },
    },
    duration: 5_000,
  });
}

export function QuickActions({ conversation, onMutated }: IQuickActionsProps) {
  const { currentUser } = useAuth();
  const conversationsProvider = useConversationsProvider();
  const sellersProvider = useSellersProvider();

  const canTransferOrArchive = usePermission("conversation", "edit", "store");
  // A seller can claim an unassigned conversation. Requires a seller identity
  // (admin-style users without a seller_id cannot self-assign).
  const canSelfAssign = currentUser?.sellerId != null && !conversation.assignedSellerId;

  const [transferOpen, setTransferOpen] = useState(false);
  const [sellers, setSellers] = useState<ISeller[]>([]);

  useEffect(() => {
    if (!transferOpen || !canTransferOrArchive) return;
    let cancelled = false;
    void sellersProvider
      .list({ storeId: conversation.storeId })
      .then((res) => {
        if (!cancelled) setSellers(res);
      })
      .catch(() => {
        if (!cancelled) setSellers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [transferOpen, canTransferOrArchive, sellersProvider, conversation.storeId]);

  const handleAssignToMe = async () => {
    if (!currentUser?.sellerId) return;
    const sellerId = currentUser.sellerId;
    const before = conversation.assignedSellerId;
    try {
      await conversationsProvider.assignSeller(conversation.id, sellerId);
      onMutated?.();
      showUndoableToast(INBOX_STRINGS.assignedToYou, async () => {
        await conversationsProvider.update(conversation.id, {
          assignedSellerId: before,
        });
        onMutated?.();
      });
      void recordAuditLog({
        actorId: currentUser.id,
        storeId: conversation.storeId,
        action: "conversation.self_assign",
        resource: "conversation",
        resourceId: conversation.id,
        before: { assignedSellerId: before },
        after: { assignedSellerId: sellerId },
      });
    } catch {
      toast.error(INBOX_STRINGS.actionFailed);
    }
  };

  const handleTransferTo = async (sellerId: string, sellerName: string) => {
    if (!currentUser) return;
    const before = conversation.assignedSellerId;
    try {
      await conversationsProvider.assignSeller(conversation.id, sellerId);
      onMutated?.();
      showUndoableToast(INBOX_STRINGS.transferredTo(sellerName), async () => {
        await conversationsProvider.update(conversation.id, {
          assignedSellerId: before,
        });
        onMutated?.();
      });
      void recordAuditLog({
        actorId: currentUser.id,
        storeId: conversation.storeId,
        action: "conversation.transfer",
        resource: "conversation",
        resourceId: conversation.id,
        before: { assignedSellerId: before },
        after: { assignedSellerId: sellerId },
      });
    } catch {
      toast.error(INBOX_STRINGS.actionFailed);
    }
  };

  const handleArchive = async () => {
    if (!currentUser) return;
    const beforeStatus = conversation.status;
    try {
      await conversationsProvider.update(conversation.id, { status: "arquivada" });
      onMutated?.();
      showUndoableToast(INBOX_STRINGS.archived, async () => {
        await conversationsProvider.update(conversation.id, { status: beforeStatus });
        onMutated?.();
      });
      void recordAuditLog({
        actorId: currentUser.id,
        storeId: conversation.storeId,
        action: "conversation.archive",
        resource: "conversation",
        resourceId: conversation.id,
        before: { status: beforeStatus },
        after: { status: "arquivada" },
      });
    } catch {
      toast.error(INBOX_STRINGS.actionFailed);
    }
  };

  return (
    <div className="flex items-center gap-0.5 rounded-md border border-border bg-card/95 p-0.5 shadow-sm backdrop-blur">
      {canSelfAssign && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                void handleAssignToMe();
              }}
              aria-label={INBOX_STRINGS.assignToMe}
            >
              <Icon icon="mdi:account-plus" size={14} />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">{INBOX_STRINGS.assignToMe}</TooltipContent>
        </Tooltip>
      )}

      <Can resource="conversation" action="edit" scope="store">
        <DropdownMenu open={transferOpen} onOpenChange={setTransferOpen}>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  aria-label={INBOX_STRINGS.transfer}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                >
                  <Icon icon="mdi:account-switch" size={14} />
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent side="left">{INBOX_STRINGS.transfer}</TooltipContent>
          </Tooltip>
          <DropdownMenuContent
            align="end"
            className="max-h-72 w-56 overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <DropdownMenuLabel>{INBOX_STRINGS.transferTo}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {sellers.map((s) => (
              <DropdownMenuItem
                key={s.id}
                onSelect={() => {
                  setTransferOpen(false);
                  void handleTransferTo(s.id, s.fullName);
                }}
              >
                {s.fullName}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              aria-label={INBOX_STRINGS.archive}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                void handleArchive();
              }}
            >
              <Icon icon="mdi:archive-arrow-down-outline" size={14} />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">{INBOX_STRINGS.archive}</TooltipContent>
        </Tooltip>
      </Can>
    </div>
  );
}
