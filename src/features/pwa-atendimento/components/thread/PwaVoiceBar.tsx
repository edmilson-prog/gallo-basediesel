import { Icon } from "@/components/Icon";
import { generateWaveBars } from "@/features/conversations/utils/audioWaveform";
import { PWA_ATENDIMENTO_STRINGS as S } from "../../i18n/pt-BR";

function clock(seconds: number): string {
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(
    Math.floor(seconds % 60),
  ).padStart(2, "0")}`;
}

interface IPwaVoiceBarProps {
  seconds: number;
  sending: boolean;
  onCancel: () => void;
  onSend: () => void;
}

/** Replaces the composer while a voice note is being recorded. */
export function PwaVoiceBar({ seconds, sending, onCancel, onSend }: IPwaVoiceBarProps) {
  const bars = generateWaveBars(`rec-${Math.floor(seconds)}`, 26);
  return (
    <div className="flex items-center gap-2.5 border-t border-border bg-card px-3 pb-[max(0.625rem,env(safe-area-inset-bottom))] pt-2.5">
      <button
        type="button"
        onClick={onCancel}
        aria-label={S.thread.discardRecording}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded text-severity-critical"
      >
        <Icon icon="mdi:trash-can-outline" size={19} />
      </button>

      <div className="flex h-11 min-w-0 flex-1 items-center gap-2.5 rounded bg-severity-critical/10 px-3">
        <span
          className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-severity-critical"
          aria-hidden
        />
        <span className="text-[13px] font-bold tabular-nums text-foreground">{clock(seconds)}</span>
        <span className="flex h-[22px] flex-1 items-center gap-[2px] overflow-hidden" aria-hidden>
          {bars.map((height, index) => (
            <span
              key={index}
              className="w-[2.5px] rounded-sm bg-foreground/35"
              style={{ height: 5 + (height % 16) }}
            />
          ))}
        </span>
        <span className="shrink-0 text-[11px] font-semibold text-muted-foreground">
          {S.thread.recording}
        </span>
      </div>

      <button
        type="button"
        onClick={onSend}
        disabled={sending}
        aria-label={S.thread.sendRecording}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded bg-primary text-primary-foreground disabled:opacity-40"
      >
        <Icon icon={sending ? "mdi:loading" : "mdi:send"} size={18} className={sending ? "animate-spin" : undefined} />
      </button>
    </div>
  );
}
