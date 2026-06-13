import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { QUICK_SEND_STRINGS } from "../../i18n/pt-BR";
import { ScheduleComposerForm } from "./ScheduleComposerForm";
import { ScheduledQueueList } from "./ScheduledQueueList";
import { DraftsList } from "./DraftsList";
import { GlobalQueueList } from "./GlobalQueueList";
import type { ISchedulingShellProps } from "./types";

export interface ISchedulingPanelsProps extends ISchedulingShellProps {
  /** Decorate the conversation queue with a vertical timeline axis. */
  timeline?: boolean;
}

export function SchedulingPanels(props: ISchedulingPanelsProps) {
  const s = QUICK_SEND_STRINGS.schedule;
  const {
    conversation,
    composer,
    scheduled,
    drafts,
    global,
    globalLoading,
    canSeeGlobal,
    showWindowWarning,
    onUseTemplate,
    onEdit,
    onCancel,
    onDeleteDraft,
    tab,
    onTabChange,
    timeline,
  } = props;

  const pendingCount = scheduled.filter((i) => i.status === "pending").length;

  return (
    <Tabs value={tab} onValueChange={(v) => onTabChange(v as typeof tab)} className="flex flex-col">
      <TabsList className="w-full justify-start">
        <TabsTrigger value="new">{s.tabNew}</TabsTrigger>
        <TabsTrigger value="scheduled">{s.tabScheduled(pendingCount)}</TabsTrigger>
        {canSeeGlobal && (
          <TabsTrigger value="all" className="gap-1">
            {s.tabAll(global.length)}
            <Icon icon="mdi:lock-outline" size={12} className="opacity-70" />
          </TabsTrigger>
        )}
      </TabsList>

      <TabsContent value="new" className="pt-3">
        <ScheduleComposerForm
          conversation={conversation}
          composer={composer}
          showWindowWarning={showWindowWarning}
          onUseTemplate={onUseTemplate}
          onDone={() => onTabChange("scheduled")}
        />
      </TabsContent>

      <TabsContent value="scheduled" className="flex flex-col gap-3 pt-3">
        <DraftsList items={drafts} onEdit={onEdit} onDelete={onDeleteDraft} />
        <div className={cn(timeline && "border-l-2 border-border/60 pl-3")}>
          <ScheduledQueueList
            items={scheduled}
            onEdit={onEdit}
            onCancel={onCancel}
            onCreate={() => onTabChange("new")}
          />
        </div>
      </TabsContent>

      {canSeeGlobal && (
        <TabsContent value="all" className="pt-3">
          <GlobalQueueList items={global} isLoading={globalLoading} onEdit={onEdit} onCancel={onCancel} />
        </TabsContent>
      )}
    </Tabs>
  );
}
