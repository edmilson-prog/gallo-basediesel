import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import type {
  ICustomer,
  ID,
  IConversation,
  IConversationContact,
  ILead,
  ISeller,
  IWhatsAppAccount,
} from "@/shared/types";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useAuth } from "@/features/auth/useAuth";
import { usePermission } from "@/features/rbac/hooks/usePermission";
import { usePipelineSettings } from "@/features/leads/hooks/usePipelineSettings";
import { NewLeadModal } from "@/features/leads/components/NewLeadModal";
import {
  avatarSyncErrorMessage,
  runContactAvatarSync,
} from "@/features/admin-settings/api/whatsappAvatarSync";
import {
  getActiveDataSource,
  recordAuditLog,
  useConversationsProvider,
  useCustomersProvider,
  useSdrSessionsProvider,
  useSellersProvider,
} from "@/providers/data";
import { RenameContactDialog } from "@/features/customers/components/RenameContactDialog";
import { TransferDialog } from "./dialogs/TransferDialog";
import { NoteDialog } from "./dialogs/NoteDialog";
import { StatusControlModeSubmenu } from "./status/StatusControlModeSubmenu";
import { CONVERSATION_STRINGS } from "../i18n/pt-BR";
import { useReturnToQueue } from "../hooks/useReturnToQueue";
import { getLeadMenuAction } from "../utils/leadMenuAction";
import { canReturnToQueue, isOwnConversation } from "../engine/assignmentGate";
import { useUnreadTracking } from "../hooks/useUnreadTracking";
import type { StatusControlMode } from "../engine/statusControlMode";

export interface IConversationMenuProps {
  conversation: IConversation;
  customer: ICustomer | null;
  lead: ILead | null;
  /** Pool-safe display contact — used to pre-fill name/phone when qualifying as lead. */
  contact: IConversationContact | null;
  /** Account behind the conversation (null when RLS-hidden/unloaded) — gates
   *  provider-specific actions like the photo re-sync. */
  whatsappAccount?: IWhatsAppAccount | null;
  onMutated?: () => void;
  /** Status-control display mode (lifted to the page; shared with the kebab). */
  statusControlMode: StatusControlMode;
  onStatusControlModeChange: (mode: StatusControlMode) => void;
}

function showUndoableToast(message: string, undo: () => Promise<void> | void) {
  toast(message, {
    action: {
      label: CONVERSATION_STRINGS.undo,
      onClick: () => {
        void Promise.resolve(undo())
          .then(() => toast.success(CONVERSATION_STRINGS.undone))
          .catch(() => toast.error(CONVERSATION_STRINGS.actionFailed));
      },
    },
    duration: 5_000,
  });
}

export function ConversationMenu({
  conversation,
  customer,
  lead,
  contact,
  whatsappAccount,
  onMutated,
  statusControlMode,
  onStatusControlModeChange,
}: IConversationMenuProps) {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const conversationsProvider = useConversationsProvider();
  const customersProvider = useCustomersProvider();
  const sellersProvider = useSellersProvider();
  const sdrSessionsProvider = useSdrSessionsProvider();

  const canEditStore = usePermission("conversation", "edit", "store");
  const canEditOwn = usePermission("conversation", "edit", "own");
  const canAddNote = usePermission("customer", "edit", "own");
  const canCreateLead = usePermission("lead", "create");
  const canViewLead = usePermission("lead", "view");
  const leadMenuAction = getLeadMenuAction(conversation, {
    canCreate: canCreateLead,
    canView: canViewLead,
  });

  // Only fetched (and only matters) when the qualify dialog can actually be
  // opened — but a `useQuery` call must run unconditionally per the rules of
  // hooks, so this stays cheap via `enabled` + the same cache key LeadsPage
  // already uses (react-query dedupes across both call sites).
  const { stages } = usePipelineSettings(conversation.storeId);
  const sellersQuery = useQuery({
    queryKey: ["sellers-list", conversation.storeId, "all"] as const,
    queryFn: () => sellersProvider.list({ storeId: conversation.storeId }),
    staleTime: 60_000,
    enabled: leadMenuAction === "qualify",
  });
  const sellers = sellersQuery.data ?? [];
  // A seller can transfer/archive the conversation assigned to them (own scope);
  // managers act on any store conversation. Mirrors the conversations RLS.
  const canManageThis =
    canEditStore || (canEditOwn && isOwnConversation(conversation, currentUser?.sellerId));
  // Staff-only return-to-queue (RLS), only when there is an assignee to remove.
  const showReturnToQueue = canReturnToQueue(conversation, { isStaff: canEditStore });
  const { returnToQueue } = useReturnToQueue(conversation, { onDone: onMutated });

  const [transferOpen, setTransferOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [qualifyOpen, setQualifyOpen] = useState(false);
  const [syncingPhoto, setSyncingPhoto] = useState(false);
  const { markViewed } = useUnreadTracking(currentUser?.id ?? null);

  const isResolved = conversation.status === "resolvida";
  const isArchived = conversation.status === "arquivada";

  // Per-contact photo re-sync (this conversation's contact ONLY) — real
  // WhatsApp data + a customers row + a bound account; hidden in demo mode.
  // The whatsapp-avatar-sync edge only speaks Evolution v2/Go (422 provider
  // guard): hide when the account is positively another engine (openwa/meta);
  // fail-open when the account row is unreadable to preserve the affordance.
  const syncPhotoSupported =
    !whatsappAccount ||
    whatsappAccount.provider === "evolution" ||
    whatsappAccount.provider === "evolution-go";
  const canSyncPhoto =
    getActiveDataSource() !== "mock" &&
    conversation.channel === "whatsapp" &&
    Boolean(customer) &&
    Boolean(conversation.whatsappAccountId) &&
    syncPhotoSupported;

  const updateAndAudit = async (
    patch: Partial<IConversation>,
    audit: { action: string; before: object; after: object },
  ) => {
    if (!currentUser) return;
    try {
      await conversationsProvider.update(conversation.id, patch);
      onMutated?.();
      void recordAuditLog({
        actorId: currentUser.id,
        storeId: conversation.storeId,
        action: audit.action,
        resource: "conversation",
        resourceId: conversation.id,
        before: audit.before,
        after: audit.after,
      });
    } catch {
      toast.error(CONVERSATION_STRINGS.actionFailed);
      throw new Error("update failed");
    }
  };

  // Closing an owned conversation (→ resolvida/arquivada) is an atomic server
  // op: terminal status + unassign + SDR reset in one call, no transitional
  // "aguardando" (spec 2026-07-03-attendance-close). Reopening (terminal →
  // em_andamento) must land a valid owned state, so it claims the conversation
  // for the acting seller first.
  const closeAndAudit = async (
    status: "resolvida" | "arquivada",
    action: string,
  ): Promise<void> => {
    if (!currentUser) return;
    const before = conversation.status;
    const beforeAssignee = conversation.assignedSellerId ?? null;
    await conversationsProvider.close(conversation.id, status);
    onMutated?.();
    void recordAuditLog({
      actorId: currentUser.id,
      storeId: conversation.storeId,
      action,
      resource: "conversation",
      resourceId: conversation.id,
      before: { status: before, assignedSellerId: beforeAssignee },
      after: { status, assignedSellerId: null },
    });
  };

  const reopenAndAudit = async (action: string): Promise<void> => {
    if (!currentUser?.sellerId) return;
    const before = conversation.status;
    await conversationsProvider.assignSeller(conversation.id, currentUser.sellerId);
    await conversationsProvider.update(conversation.id, { status: "em_andamento" });
    onMutated?.();
    void recordAuditLog({
      actorId: currentUser.id,
      storeId: conversation.storeId,
      action,
      resource: "conversation",
      resourceId: conversation.id,
      before: { status: before, assignedSellerId: conversation.assignedSellerId ?? null },
      after: { status: "em_andamento", assignedSellerId: currentUser.sellerId },
    });
  };

  const handleResolveToggle = async () => {
    const before = conversation.status;
    const beforeAssignee = conversation.assignedSellerId ?? null;
    try {
      if (isResolved) {
        await reopenAndAudit("conversation.resolve");
        showUndoableToast(CONVERSATION_STRINGS.reopened, () =>
          closeAndAudit("resolvida", "conversation.resolve_undo"),
        );
      } else {
        await closeAndAudit("resolvida", "conversation.resolve");
        showUndoableToast(CONVERSATION_STRINGS.resolved, async () => {
          if (beforeAssignee) {
            await conversationsProvider.assignSeller(conversation.id, beforeAssignee);
          }
          await conversationsProvider.update(conversation.id, { status: before });
          onMutated?.();
          void recordAuditLog({
            actorId: currentUser!.id,
            storeId: conversation.storeId,
            action: "conversation.resolve_undo",
            resource: "conversation",
            resourceId: conversation.id,
            before: { status: "resolvida", assignedSellerId: null },
            after: { status: before, assignedSellerId: beforeAssignee },
          });
        });
      }
    } catch {
      toast.error(CONVERSATION_STRINGS.actionFailed);
    }
  };

  const handleArchiveToggle = async () => {
    const before = conversation.status;
    const beforeAssignee = conversation.assignedSellerId ?? null;
    try {
      if (isArchived) {
        await reopenAndAudit("conversation.archive");
        showUndoableToast(CONVERSATION_STRINGS.unarchived, () =>
          closeAndAudit("arquivada", "conversation.archive_undo"),
        );
      } else {
        await closeAndAudit("arquivada", "conversation.archive");
        showUndoableToast(CONVERSATION_STRINGS.archived, async () => {
          if (beforeAssignee) {
            await conversationsProvider.assignSeller(conversation.id, beforeAssignee);
          }
          await conversationsProvider.update(conversation.id, { status: before });
          onMutated?.();
          void recordAuditLog({
            actorId: currentUser!.id,
            storeId: conversation.storeId,
            action: "conversation.archive_undo",
            resource: "conversation",
            resourceId: conversation.id,
            before: { status: "arquivada", assignedSellerId: null },
            after: { status: before, assignedSellerId: beforeAssignee },
          });
        });
      }
    } catch {
      toast.error(CONVERSATION_STRINGS.actionFailed);
    }
  };

  const handleMarkUnread = () => {
    if (!currentUser) return;
    // Reset the per-user "last view" marker to a moment before the
    // conversation's last message so the inbox bolds the row again.
    const fakeOld = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    markViewed(conversation.id, fakeOld);
    toast.success(CONVERSATION_STRINGS.markedUnread);
  };

  const handlePauseSdrToggle = async () => {
    const before = conversation.isSdrActive;
    const next = !before;
    try {
      await updateAndAudit(
        { isSdrActive: next },
        {
          action: next ? "sdr_reactivated" : "sdr_paused_by_human",
          before: { isSdrActive: before },
          after: { isSdrActive: next },
        },
      );
      // Keep the SDR session state in sync with the conversation flag (PRD-020).
      try {
        const session = await sdrSessionsProvider.getByConversation(conversation.id);
        if (session) {
          if (next && session.state === "pausado") {
            await sdrSessionsProvider.resume(session.id);
          } else if (!next && session.state !== "pausado") {
            await sdrSessionsProvider.pause(session.id);
          }
        }
      } catch {
        /* session sync is best-effort */
      }
      toast.success(next ? CONVERSATION_STRINGS.sdrResumed : CONVERSATION_STRINGS.sdrPaused);
    } catch {
      /* toast raised */
    }
  };

  const handleTransfer = async (sellerId: ID, sellerName: string) => {
    const before = conversation.assignedSellerId;
    try {
      await conversationsProvider.assignSeller(conversation.id, sellerId);
      onMutated?.();
      void recordAuditLog({
        actorId: currentUser!.id,
        storeId: conversation.storeId,
        action: "conversation.transfer",
        resource: "conversation",
        resourceId: conversation.id,
        before: { assignedSellerId: before },
        after: { assignedSellerId: sellerId },
      });
      toast.success(`Conversa transferida para ${sellerName}`);
    } catch {
      toast.error(CONVERSATION_STRINGS.actionFailed);
    }
  };

  const handleEscalate = async () => {
    if (!currentUser) return;
    try {
      const sellers = await sellersProvider.list({ storeId: conversation.storeId });
      const manager = sellers.find((s: ISeller) => isManager(s));
      if (!manager) {
        toast.error(CONVERSATION_STRINGS.noManagerAvailable);
        return;
      }
      await handleTransfer(manager.id, manager.fullName);
      toast.success(CONVERSATION_STRINGS.escalatedTo(manager.fullName));
    } catch {
      toast.error(CONVERSATION_STRINGS.actionFailed);
    }
  };

  const handleSyncPhoto = async () => {
    if (!customer || !conversation.whatsappAccountId || syncingPhoto) return;
    setSyncingPhoto(true);
    // Immediate feedback: the menu item (and its inline spinner) unmounts when
    // the dropdown closes on select, so without a toast the action feels like
    // nothing happened. A loading toast acknowledges the command right away and
    // is then swapped in place (same id) for the outcome.
    const toastId = toast.loading(CONVERSATION_STRINGS.photoSyncing);
    try {
      const outcome = await runContactAvatarSync(conversation.whatsappAccountId, customer.id);
      if (outcome === "with-photo") {
        toast.success(CONVERSATION_STRINGS.photoUpdated, { id: toastId });
        onMutated?.();
      } else if (outcome === "without-photo") {
        toast.info(CONVERSATION_STRINGS.photoUnavailable, { id: toastId });
      } else {
        toast.error(CONVERSATION_STRINGS.photoSyncFailed, { id: toastId });
      }
    } catch (error) {
      toast.error(avatarSyncErrorMessage(error), { id: toastId });
    } finally {
      setSyncingPhoto(false);
    }
  };

  const handleAddNote = async (content: string) => {
    if (!customer) {
      toast.error(CONVERSATION_STRINGS.actionFailed);
      return;
    }
    // `customer_notes.author_id` is a FK to sellers(id) — the note's author is
    // the acting *seller*, not the auth user. Using currentUser.id (auth uuid)
    // violates that FK on Supabase and shows a raw id in the UI on mock.
    const sellerId = currentUser?.sellerId;
    if (!sellerId) {
      toast.error(CONVERSATION_STRINGS.noteAuthorMissing);
      return;
    }
    try {
      await customersProvider.addNote(customer.id, content, sellerId);
      toast.success(CONVERSATION_STRINGS.noteSaved);
    } catch {
      toast.error(CONVERSATION_STRINGS.actionFailed);
    }
  };

  return (
    <>
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-9 w-9 p-0"
                aria-label={CONVERSATION_STRINGS.moreActions}
              >
                <Icon icon="mdi:dots-vertical" size={18} />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>{CONVERSATION_STRINGS.moreActions}</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="end" className="w-56">
          {canEditOwn && (
            <DropdownMenuItem onSelect={handleResolveToggle}>
              <Icon icon="mdi:check-circle-outline" size={14} className="mr-2" />
              {isResolved ? "Reabrir" : CONVERSATION_STRINGS.menu.markResolved}
            </DropdownMenuItem>
          )}
          {canEditOwn && (
            <DropdownMenuItem onSelect={handleMarkUnread}>
              <Icon icon="mdi:email-mark-as-unread" size={14} className="mr-2" />
              {CONVERSATION_STRINGS.menu.markUnread}
            </DropdownMenuItem>
          )}
          {canManageThis && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setTransferOpen(true)}>
                <Icon icon="mdi:account-switch" size={14} className="mr-2" />
                {CONVERSATION_STRINGS.menu.transfer}
              </DropdownMenuItem>
            </>
          )}
          {showReturnToQueue && (
            <DropdownMenuItem
              onSelect={() => void returnToQueue()}
              className="text-severity-warning focus:text-severity-warning"
            >
              <Icon icon="mdi:account-arrow-left-outline" size={14} className="mr-2" />
              {CONVERSATION_STRINGS.menu.returnToQueue}
            </DropdownMenuItem>
          )}
          {canEditStore && (
            <>
              {conversation.isSdrActive && (
                <DropdownMenuItem onSelect={handleEscalate}>
                  <Icon icon="mdi:account-arrow-up-outline" size={14} className="mr-2" />
                  {CONVERSATION_STRINGS.menu.escalate}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onSelect={handlePauseSdrToggle}>
                <Icon
                  icon={conversation.isSdrActive ? "mdi:robot-off-outline" : "mdi:robot-outline"}
                  size={14}
                  className="mr-2"
                />
                {conversation.isSdrActive
                  ? CONVERSATION_STRINGS.menu.pauseSdr
                  : CONVERSATION_STRINGS.menu.resumeSdr}
              </DropdownMenuItem>
            </>
          )}
          {canManageThis && (
            <DropdownMenuItem onSelect={handleArchiveToggle}>
              <Icon
                icon={
                  isArchived ? "mdi:archive-arrow-up-outline" : "mdi:archive-arrow-down-outline"
                }
                size={14}
                className="mr-2"
              />
              {isArchived ? CONVERSATION_STRINGS.menu.unarchive : CONVERSATION_STRINGS.menu.archive}
            </DropdownMenuItem>
          )}
          {canAddNote && customer && (
            <>
              <DropdownMenuSeparator />
              {/* Renaming the contact edits the customer — same own-scope permission. */}
              <DropdownMenuItem onSelect={() => setRenameOpen(true)}>
                <Icon icon="mdi:rename-outline" size={14} className="mr-2" />
                {CONVERSATION_STRINGS.menu.renameContact}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setNoteOpen(true)}>
                <Icon icon="mdi:note-plus-outline" size={14} className="mr-2" />
                {CONVERSATION_STRINGS.menu.addNote}
              </DropdownMenuItem>
            </>
          )}
          {leadMenuAction === "qualify" && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setQualifyOpen(true)}>
                <Icon icon="mdi:account-convert-outline" size={14} className="mr-2" />
                {CONVERSATION_STRINGS.menu.qualifyAsLead}
              </DropdownMenuItem>
            </>
          )}
          {leadMenuAction === "view" && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() =>
                  void navigate({
                    to: "/app/leads/$id",
                    params: { id: conversation.leadId as ID },
                  })
                }
              >
                <Icon icon="mdi:account-arrow-right-outline" size={14} className="mr-2" />
                {CONVERSATION_STRINGS.menu.viewLead}
              </DropdownMenuItem>
            </>
          )}
          {canSyncPhoto && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => void handleSyncPhoto()} disabled={syncingPhoto}>
                <Icon
                  icon={syncingPhoto ? "mdi:loading" : "mdi:account-sync-outline"}
                  size={14}
                  className={cn("mr-2", syncingPhoto && "animate-spin")}
                />
                {CONVERSATION_STRINGS.menu.syncPhoto}
              </DropdownMenuItem>
            </>
          )}
          {canEditOwn && (
            <>
              <DropdownMenuSeparator />
              <StatusControlModeSubmenu
                value={statusControlMode}
                onChange={onStatusControlModeChange}
              />
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <TransferDialog
        open={transferOpen}
        onOpenChange={setTransferOpen}
        storeId={conversation.storeId}
        excludeSellerId={conversation.assignedSellerId}
        onConfirm={handleTransfer}
      />

      <NoteDialog open={noteOpen} onOpenChange={setNoteOpen} onConfirm={handleAddNote} />

      {customer && (
        <RenameContactDialog
          customer={customer}
          open={renameOpen}
          onOpenChange={setRenameOpen}
          onRenamed={() => onMutated?.()}
        />
      )}

      <NewLeadModal
        open={qualifyOpen}
        onClose={() => setQualifyOpen(false)}
        stages={stages}
        sellers={sellers}
        conversationId={conversation.id}
        initialName={contact?.name}
        initialPhone={contact?.phone}
        initialSellerId={conversation.assignedSellerId}
        onCreated={(createdLead, meta) => {
          setQualifyOpen(false);
          onMutated?.();
          if (meta?.linked !== false) {
            toast.success(CONVERSATION_STRINGS.leadQualified, {
              action: {
                label: CONVERSATION_STRINGS.menu.viewLead,
                onClick: () =>
                  void navigate({ to: "/app/leads/$id", params: { id: createdLead.id } }),
              },
            });
          }
        }}
      />
    </>
  );
}

function isManager(seller: ISeller): boolean {
  // The mock seller record holds the role via `currentRole`/`roleName` in
  // a few places, but the canonical resolution lives in mock-users (RBAC).
  // For escalation we treat any non-internal-Vendedor seller with
  // `accessibleStoreIds.length > 1` as a manager — heuristic, replaced in
  // Fase 2 by a direct role lookup.
  return (seller.accessibleStoreIds ?? []).length > 1;
}
