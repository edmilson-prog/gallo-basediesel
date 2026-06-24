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
import { useAuth } from "@/features/auth/useAuth";
import { usePermission } from "@/features/rbac/hooks/usePermission";
import { recordAuditLog, useConversationsProvider, useSellersProvider } from "@/providers/data";
import type { IConversation, ISeller } from "@/shared/types";
import { INBOX_STRINGS } from "../i18n/pt-BR";
import { useSelfAssign } from "../hooks/useSelfAssign";
import { useReturnToQueue } from "../hooks/useReturnToQueue";
import { canReturnToQueue } from "../engine/assignmentGate";

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
  const { selfAssign, canSelfAssign } = useSelfAssign(conversation, { onDone: onMutated });
  const { returnToQueue, returning } = useReturnToQueue(conversation, { onDone: onMutated });

  const canEditStore = usePermission("conversation", "edit", "store");
  const canEditOwn = usePermission("conversation", "edit", "own");
  // Managers act on any store conversation; a seller can transfer/archive the
  // conversation currently assigned to them (own scope) — mirrors the RLS.
  const isOwnConversation =
    currentUser?.sellerId != null && conversation.assignedSellerId === currentUser.sellerId;
  const canTransferOrArchive = canEditStore || (canEditOwn && isOwnConversation);
  // Return-to-queue is STAFF-ONLY (the RLS only lets is_staff() null the column)
  // and only when there is an assignee to remove — a tighter gate than transfer.
  const showReturnToQueue = canReturnToQueue(conversation, { isStaff: canEditStore });

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
                void selfAssign();
              }}
              aria-label={INBOX_STRINGS.assignToMe}
            >
              <Icon icon="mdi:account-plus" size={14} />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">{INBOX_STRINGS.assignToMe}</TooltipContent>
        </Tooltip>
      )}

      {canTransferOrArchive && (
        <>
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

          {showReturnToQueue && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-severity-warning hover:bg-severity-warning/10 hover:text-severity-warning"
                  aria-label={INBOX_STRINGS.returnToQueue}
                  disabled={returning}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    void returnToQueue();
                  }}
                >
                  <Icon icon="mdi:account-arrow-left-outline" size={14} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left">{INBOX_STRINGS.returnToQueue}</TooltipContent>
            </Tooltip>
          )}

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
        </>
      )}
    </div>
  );
}
