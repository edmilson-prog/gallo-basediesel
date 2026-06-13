import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ICustomer, IConversation, IScheduledSend, IWhatsAppAccount } from "@/shared/types";
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
import { useCustomersProvider } from "@/providers/data";
import { useAuth } from "@/features/auth/useAuth";
import { useMetaWindow } from "@/features/conversations/hooks/useMetaWindow";
import { useConversationScheduled } from "../../hooks/useConversationScheduled";
import { useSchedulingComposer } from "../../hooks/useSchedulingComposer";
import { useSchedulingViewMode } from "../../hooks/useSchedulingViewMode";
import { useGlobalScheduled } from "../../hooks/useGlobalScheduled";
import { QUICK_SEND_STRINGS } from "../../i18n/pt-BR";
import { SchedulingModalShell } from "./shells/SchedulingModalShell";
import { SchedulingDrawerShell } from "./shells/SchedulingDrawerShell";
import { SchedulingInlineShell } from "./shells/SchedulingInlineShell";
import { SchedulingTimelineShell } from "./shells/SchedulingTimelineShell";
import type { ISchedulingShellProps, SchedulingTab } from "./types";

export interface ISchedulingCenterProps {
  conversation: IConversation;
  whatsappAccount: IWhatsAppAccount | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Initial tab — "scheduled" when opened from the badge, else "new". */
  initialTab?: SchedulingTab;
  /** Bubble a "use template" request up to the composer (24h-window CTA). */
  onUseTemplate?: () => void;
}

/** Recipient name/phone for the header + global queue. */
function resolveCustomerContext(c: ICustomer | null | undefined): { name: string; phone: string } {
  if (!c) return { name: "Cliente", phone: "" };
  const name =
    c.type === "B2B"
      ? c.nomeFantasia || c.razaoSocial || c.contactName || "Cliente"
      : c.fullName || "Cliente";
  return { name, phone: c.phone ?? "" };
}

export function SchedulingCenter({
  conversation,
  whatsappAccount,
  open,
  onOpenChange,
  initialTab = "new",
  onUseTemplate,
}: ISchedulingCenterProps) {
  const s = QUICK_SEND_STRINGS.schedule;
  const [mode, setMode] = useSchedulingViewMode();
  const [tab, setTab] = useState<SchedulingTab>(initialTab);
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);

  const composer = useSchedulingComposer(conversation);
  const { items, cancel, update } = useConversationScheduled(conversation.id);
  const { hasRole } = useAuth();
  const canSeeGlobal = hasRole(["Owner", "Gestor"]);
  const global = useGlobalScheduled(canSeeGlobal && open && tab === "all");

  const win = useMetaWindow(conversation, whatsappAccount);
  const showWindowWarning = whatsappAccount?.provider === "meta" && !win.canSendFreeText;

  const customersProvider = useCustomersProvider();
  const customerQuery = useQuery({
    queryKey: ["customers", "detail", conversation.customerId],
    queryFn: () => customersProvider.get(conversation.customerId as string),
    enabled: open && !!conversation.customerId,
    staleTime: 60_000,
  });
  const { name: customerName, phone: customerPhone } = resolveCustomerContext(customerQuery.data);

  // Reset the tab to the requested one each time the center opens.
  useEffect(() => {
    if (open) setTab(initialTab);
  }, [open, initialTab]);

  const scheduled = useMemo(
    () => items.filter((i) => i.status === "pending" || i.status === "sent" || i.status === "failed"),
    [items],
  );
  const drafts = useMemo(() => items.filter((i) => i.status === "draft"), [items]);

  // Close guard — confirm discard when composing unsaved content on the "new" tab.
  const requestClose = (next: boolean) => {
    if (!next && tab === "new" && composer.canSaveDraft && !composer.editingId) {
      setConfirmDiscardOpen(true);
      return;
    }
    if (!next) composer.reset();
    onOpenChange(next);
  };

  const onEdit = (item: IScheduledSend) => {
    composer.loadForEdit(item);
    setTab("new");
  };

  const handleCancel = (item: IScheduledSend) => {
    let undone = false;
    toast(s.cancelled, {
      action: { label: s.undo, onClick: () => { undone = true; } },
      duration: 5_000,
      onAutoClose: () => { if (!undone) cancel(item.id); },
      onDismiss: () => { if (!undone) cancel(item.id); },
    });
  };

  const onDeleteDraft = (item: IScheduledSend) => {
    // Drafts are removed by marking them cancelled (hidden from every list).
    update(item.id, { status: "cancelled" });
  };

  const shellProps: ISchedulingShellProps = {
    conversation,
    customerName,
    customerPhone,
    open,
    onOpenChange: requestClose,
    mode,
    onModeChange: setMode,
    tab,
    onTabChange: setTab,
    composer,
    scheduled,
    drafts,
    global: global.items,
    globalLoading: global.isLoading,
    canSeeGlobal,
    showWindowWarning,
    onUseTemplate,
    onEdit,
    onCancel: handleCancel,
    onDeleteDraft,
  };

  const Shell =
    mode === "drawer"
      ? SchedulingDrawerShell
      : mode === "inline"
        ? SchedulingInlineShell
        : mode === "timeline"
          ? SchedulingTimelineShell
          : SchedulingModalShell;

  return (
    <>
      <Shell {...shellProps} />
      <AlertDialog open={confirmDiscardOpen} onOpenChange={setConfirmDiscardOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{s.discardConfirmTitle}</AlertDialogTitle>
            <AlertDialogDescription>{s.discardConfirmBody}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{s.discardConfirmCancel}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmDiscardOpen(false);
                composer.reset();
                onOpenChange(false);
              }}
            >
              {s.discardConfirmOk}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
