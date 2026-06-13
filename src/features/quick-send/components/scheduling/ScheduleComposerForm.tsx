import { toast } from "sonner";
import type { IConversation } from "@/shared/types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { formatScheduleLabel } from "../../engine/scheduledSend";
import type { IUseSchedulingComposerResult } from "../../hooks/useSchedulingComposer";
import { QUICK_SEND_STRINGS } from "../../i18n/pt-BR";
import { MediaAttachField } from "./MediaAttachField";
import { ScheduleTimePicker } from "./ScheduleTimePicker";

export interface IScheduleComposerFormProps {
  conversation: IConversation;
  composer: IUseSchedulingComposerResult;
  showWindowWarning?: boolean;
  onUseTemplate?: () => void;
  /** Called after a successful schedule/draft so the shell can switch to the list. */
  onDone?: () => void;
}

const DISABLED_REASON: Record<"empty" | "no-time" | "past", string> = {
  empty: QUICK_SEND_STRINGS.schedule.disabledEmpty,
  "no-time": QUICK_SEND_STRINGS.schedule.disabledNoTime,
  past: QUICK_SEND_STRINGS.schedule.pastRejected,
};

export function ScheduleComposerForm({
  conversation,
  composer,
  showWindowWarning = false,
  onUseTemplate,
  onDone,
}: IScheduleComposerFormProps) {
  const s = QUICK_SEND_STRINGS.schedule;
  const { form, editingId, setText, setMedia, setScheduledFor, block, canSaveDraft, reset } = composer;

  const onSchedule = async () => {
    try {
      const saved = await composer.schedule();
      toast.success(s.scheduledToast(formatScheduleLabel(saved.scheduledFor ?? "")));
      onDone?.();
    } catch {
      toast.error(QUICK_SEND_STRINGS.errors.sendFailed);
    }
  };

  const onDraft = async () => {
    try {
      await composer.saveDraft();
      toast.success(s.draftSaved);
      onDone?.();
    } catch {
      toast.error(QUICK_SEND_STRINGS.errors.sendFailed);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {form.media ? s.fieldLabelMedia : s.fieldLabel}
        </label>
        <Textarea
          value={form.text}
          onChange={(e) => setText(e.target.value)}
          placeholder={s.fieldPlaceholder}
          rows={3}
          className="min-h-[72px] resize-none bg-background"
          aria-label={form.media ? s.fieldLabelMedia : s.fieldLabel}
        />
      </div>

      <MediaAttachField conversation={conversation} media={form.media} onChange={setMedia} />

      <ScheduleTimePicker
        value={form.scheduledFor}
        onChange={setScheduledFor}
        showWindowWarning={showWindowWarning}
        onUseTemplate={onUseTemplate}
      />

      <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => void onDraft()}
          disabled={!canSaveDraft}
        >
          {s.ctaSaveDraft}
        </Button>
        <div className="flex items-center gap-2">
          {editingId && (
            <Button type="button" variant="outline" size="sm" onClick={reset}>
              {s.cancel}
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            className={cn("gap-1.5")}
            onClick={() => void onSchedule()}
            disabled={block !== null}
            title={block ? DISABLED_REASON[block] : undefined}
          >
            {editingId ? s.ctaSaveEdit : s.ctaSchedule}
          </Button>
        </div>
      </div>
    </div>
  );
}
