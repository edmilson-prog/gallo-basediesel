import type { IConversation, IScheduledSend, IScheduledSendWithContext } from "@/shared/types";
import type { IUseSchedulingComposerResult } from "../../hooks/useSchedulingComposer";
import type { SchedulingViewMode } from "../../hooks/useSchedulingViewMode";

export type SchedulingTab = "new" | "scheduled" | "all";

/**
 * Single contract every shell consumes. The orchestrator (SchedulingCenter)
 * owns all state/data and passes it down; shells ONLY position the same core
 * subcomponents — no scheduling logic lives in a shell.
 */
export interface ISchedulingShellProps {
  conversation: IConversation;
  customerName: string;
  customerPhone: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: SchedulingViewMode;
  onModeChange: (mode: SchedulingViewMode) => void;
  tab: SchedulingTab;
  onTabChange: (tab: SchedulingTab) => void;
  composer: IUseSchedulingComposerResult;
  /** Conversation queue (pending/sent/failed — no drafts, no cancelled). */
  scheduled: IScheduledSend[];
  drafts: IScheduledSend[];
  global: IScheduledSendWithContext[];
  globalLoading: boolean;
  canSeeGlobal: boolean;
  showWindowWarning: boolean;
  onUseTemplate?: () => void;
  onEdit: (item: IScheduledSend) => void;
  onCancel: (item: IScheduledSend) => void;
  onDeleteDraft: (item: IScheduledSend) => void;
}
