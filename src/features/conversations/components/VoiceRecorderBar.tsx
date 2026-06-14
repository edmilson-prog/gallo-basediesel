import { useMemo, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CONVERSATION_STRINGS } from "../i18n/pt-BR";
import { formatDuration } from "../utils/messageDisplay";
import { formatStopwatch } from "../utils/audioRecording";
import { generateWaveBars } from "../utils/audioWaveform";

const V = CONVERSATION_STRINGS.voice;
const BAR_COUNT = 28;

export interface IVoiceRecorderBarProps {
  status: "recording" | "recorded";
  /** Live elapsed seconds while recording; final length once recorded. */
  elapsedSeconds: number;
  /** Object URL of the recorded note (preview playback). */
  recordedUrl: string | null;
  /** Upload/send in flight — locks the actions and spins the send icon. */
  sending: boolean;
  onStop: () => void;
  onCancel: () => void;
  onSend: () => void;
}

/**
 * Composer-width bar shown in place of the textarea while recording a voice note
 * or reviewing the recorded one. Recording: pulsing meter + live timer + stop.
 * Recorded: inline mini-player (mirrors AudioMediaTile) + discard + send.
 */
export function VoiceRecorderBar(props: IVoiceRecorderBarProps) {
  const { status, elapsedSeconds, recordedUrl, sending, onStop, onCancel, onSend } = props;
  const isRecording = status === "recording";

  return (
    <div className="flex flex-1 items-center gap-2">
      {/* Cancel (recording) / Discard (recorded) */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9 w-9 shrink-0 p-0 text-destructive hover:text-destructive"
            onClick={onCancel}
            disabled={sending}
            aria-label={isRecording ? V.cancel : V.discard}
          >
            <Icon icon="mdi:delete-outline" size={18} />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{isRecording ? V.cancel : V.discard}</TooltipContent>
      </Tooltip>

      {isRecording ? (
        <RecordingMeter seconds={elapsedSeconds} />
      ) : (
        <RecordedPreview url={recordedUrl} fallbackSeconds={elapsedSeconds} />
      )}

      {isRecording ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              size="sm"
              className="h-9 w-9 shrink-0 rounded-full p-0"
              onClick={onStop}
              aria-label={V.stop}
            >
              <Icon icon="mdi:stop" size={18} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{V.stop}</TooltipContent>
        </Tooltip>
      ) : (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="shrink-0">
              <Button
                type="button"
                size="sm"
                className="h-9 gap-1.5 px-3"
                onClick={onSend}
                disabled={sending}
                aria-label={V.send}
              >
                <Icon
                  icon={sending ? "mdi:loading" : "mdi:send"}
                  className={sending ? "animate-spin" : undefined}
                  size={14}
                />
                <span className="hidden lg:inline">{V.send}</span>
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>{V.send}</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}

/** Cosmetic live meter while recording: a red dot, the live timer and bars. */
function RecordingMeter({ seconds }: { seconds: number }) {
  const bars = useMemo(() => generateWaveBars("recording-meter", BAR_COUNT), []);
  return (
    <div
      className="flex flex-1 items-center gap-2.5 rounded-lg border border-border bg-muted/40 px-3 py-2"
      aria-label={V.recording}
    >
      <span
        className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-destructive"
        aria-hidden
      />
      {/* Prominent live timer (mm:ss.tenths) — length of the note being recorded. */}
      <span
        className="shrink-0 text-sm font-semibold tabular-nums text-foreground"
        aria-live="polite"
        aria-label={`${V.recording} ${formatStopwatch(seconds)}`}
      >
        {formatStopwatch(seconds)}
      </span>
      <div className="flex h-5 flex-1 items-center gap-[2px] overflow-hidden" aria-hidden>
        {bars.map((h, i) => (
          <div
            key={i}
            className="animate-pulse bg-destructive/60"
            style={{
              width: 2,
              height: `${h}%`,
              borderRadius: 2,
              animationDelay: `${(i % 6) * 80}ms`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

/** Inline mini-player for the recorded note (mirrors AudioMediaTile playback). */
function RecordedPreview({
  url,
  fallbackSeconds,
}: {
  url: string | null;
  fallbackSeconds: number;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const bars = useMemo(() => generateWaveBars("recorded-preview", BAR_COUNT), []);

  // Locally-recorded webm/opus often reports a non-finite duration until a seek —
  // fall back to the recorder's elapsed time for the counter.
  const effDuration =
    duration > 0 && Number.isFinite(duration) ? duration : Math.max(0, fallbackSeconds);
  const playedRatio = effDuration > 0 ? Math.min(1, current / effDuration) : 0;
  const showElapsed = playing || current > 0;

  function toggle() {
    const el = audioRef.current;
    if (!el || !url) return;
    if (el.paused) void el.play().catch(() => {});
    else el.pause();
  }

  return (
    <div
      className="flex flex-1 items-center gap-2 rounded-lg border border-border bg-muted/40 px-2 py-1.5 text-muted-foreground"
      aria-label={V.preview}
    >
      {url && (
        <audio
          ref={audioRef}
          src={url}
          preload="metadata"
          className="hidden"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => {
            setPlaying(false);
            setCurrent(0);
          }}
          onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => {
            const d = e.currentTarget.duration;
            if (Number.isFinite(d) && d > 0) setDuration(d);
          }}
        />
      )}
      <button
        type="button"
        onClick={toggle}
        disabled={!url}
        aria-label={playing ? V.pause : V.play}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
      >
        <Icon icon={playing ? "mdi:pause" : "mdi:play"} size={16} />
      </button>
      <div className="flex h-5 flex-1 items-center gap-[1.5px] overflow-hidden" aria-hidden>
        {bars.map((h, i) => {
          const played = i / bars.length <= playedRatio;
          return (
            <div
              key={i}
              className={played ? "bg-primary" : "bg-muted-foreground/40"}
              style={{ width: 2, height: `${h}%`, borderRadius: 2 }}
            />
          );
        })}
      </div>
      <span className="shrink-0 text-xs font-medium tabular-nums">
        {formatDuration(showElapsed ? current : effDuration)}
      </span>
    </div>
  );
}
