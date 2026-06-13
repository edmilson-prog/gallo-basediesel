import { useRef, useState } from "react";
import { toast } from "sonner";
import type { IConversation, ScheduledMediaType } from "@/shared/types";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SCHEDULE_ATTACH_ACCEPT,
  useScheduleMediaUpload,
} from "../../hooks/useScheduleMediaUpload";
import type { IScheduledMediaDraft } from "../../engine/scheduleComposer";
import { QUICK_SEND_STRINGS } from "../../i18n/pt-BR";

export interface IMediaAttachFieldProps {
  conversation: IConversation;
  media: IScheduledMediaDraft | null;
  onChange: (media: IScheduledMediaDraft | null) => void;
}

const KIND_ICON: Record<ScheduledMediaType, string> = {
  image: "mdi:image-outline",
  video: "mdi:play-circle-outline",
  audio: "mdi:microphone-outline",
  document: "mdi:file-document-outline",
};

/** Attach exactly one media item to a scheduled message (Fase 1: 1 per message). */
export function MediaAttachField({ conversation, media, onChange }: IMediaAttachFieldProps) {
  const s = QUICK_SEND_STRINGS.schedule;
  const { uploadForSchedule } = useScheduleMediaUpload(conversation);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const kindRef = useRef<ScheduledMediaType>("image");
  const [uploading, setUploading] = useState(false);

  const pick = (kind: ScheduledMediaType) => {
    kindRef.current = kind;
    const el = inputRef.current;
    if (!el) return;
    el.accept = SCHEDULE_ATTACH_ACCEPT[kind];
    el.click();
  };

  const onSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const result = await uploadForSchedule(file, kindRef.current);
      if (result) onChange(result);
    } catch {
      toast.error(s.attachFailed);
    } finally {
      setUploading(false);
    }
  };

  if (media) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-2.5 py-2">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded bg-background text-muted-foreground">
          {media.mediaType === "image" && media.previewUrl ? (
            <img src={media.previewUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <Icon icon={KIND_ICON[media.mediaType]} size={18} />
          )}
        </span>
        <span className="min-w-0 flex-1 truncate text-xs text-foreground">{media.fileName}</span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          aria-label={QUICK_SEND_STRINGS.picker.cancelStaged}
          onClick={() => onChange(null)}
        >
          <Icon icon="mdi:close" size={14} />
        </Button>
      </div>
    );
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" size="sm" className="h-9 gap-1.5" disabled={uploading}>
            <Icon icon={uploading ? "mdi:loading" : "mdi:paperclip"} size={15} className={uploading ? "animate-spin" : ""} />
            {s.attach}
            <Icon icon="mdi:chevron-down" size={14} className="text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-44">
          <DropdownMenuItem onSelect={() => pick("image")}>
            <Icon icon={KIND_ICON.image} size={14} className="mr-2" />
            {s.attachImage}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => pick("video")}>
            <Icon icon={KIND_ICON.video} size={14} className="mr-2" />
            {s.attachVideo}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => pick("audio")}>
            <Icon icon={KIND_ICON.audio} size={14} className="mr-2" />
            {s.attachAudio}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => pick("document")}>
            <Icon icon={KIND_ICON.document} size={14} className="mr-2" />
            {s.attachDocument}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
        onChange={(e) => void onSelected(e)}
      />
    </>
  );
}
