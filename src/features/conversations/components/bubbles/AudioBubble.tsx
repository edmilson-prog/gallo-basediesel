import { useEffect, useMemo, useRef, useState } from "react";
import type { IMessage } from "@/shared/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { getActiveDataSource } from "@/providers/data";
import { BubbleChrome } from "./bubbleChrome";
import { fakeAudioSeconds, formatDuration } from "../../utils/messageDisplay";
import {
  PLAYBACK_RATE_STORAGE_KEY,
  formatPlaybackRate,
  nextPlaybackRate,
  sanitizePlaybackRate,
} from "../../utils/audioPlayback";
import { CONVERSATION_STRINGS } from "../../i18n/pt-BR";
import { useResolvedMediaUrl } from "../../hooks/useResolvedMediaUrl";
import { useRetryTranscription } from "../../hooks/useRetryTranscription";
import { downloadFileName, triggerMediaDownload } from "../../utils/mediaDownload";

const BAR_COUNT = 32;

/** Deterministic pseudo-waveform from the message id (stable across renders). */
function generateWave(seed: string): number[] {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) | 0;
  const bars: number[] = [];
  for (let i = 0; i < BAR_COUNT; i += 1) {
    h = (h * 1103515245 + 12345) | 0;
    const v = (Math.abs(h) % 80) + 20; // 20-100
    bars.push(v);
  }
  return bars;
}

/**
 * Audio message bubble.
 *
 * Production (`supabase`): plays the real file via an `<audio>` element fed by a
 * signed URL resolved from the private `whatsapp-media` object path. Inbound
 * media whose download failed (no bytes) degrades to an "unavailable" state.
 *
 * Demonstração (`mock`): keeps a cosmetic animated waveform — mock "audio"
 * assets are placeholder images, not real audio, so there is nothing to play.
 */
export function AudioBubble({ message, onRetry }: { message: IMessage; onRetry?: () => void }) {
  const isDemo = getActiveDataSource() === "mock";
  // In demo mode there is no real file to sign — skip the query entirely.
  const { data: url, isLoading } = useResolvedMediaUrl(isDemo ? undefined : message.mediaUrl);

  if (isDemo) return <SimulatedAudioPlayer message={message} onRetry={onRetry} />;
  if (url) return <RealAudioPlayer url={url} message={message} onRetry={onRetry} />;
  if (isLoading && message.mediaUrl) return <AudioStub message={message} onRetry={onRetry} loading />;
  return <AudioStub message={message} onRetry={onRetry} />;
}

/**
 * Shared play/pause control. When `heard` is set (outbound voice note the
 * recipient already played → status `read`), the icon turns sky-blue, mirroring
 * WhatsApp's "voice note listened" cue without inventing a second status system.
 */
function PlayPauseButton({
  playing,
  onClick,
  heard = false,
}: {
  playing: boolean;
  onClick: () => void;
  heard?: boolean;
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-9 w-9 shrink-0 rounded-full p-0 transition-transform active:scale-95 motion-reduce:transition-none motion-reduce:active:scale-100"
      onClick={onClick}
      aria-label={playing ? "Pausar áudio" : "Reproduzir áudio"}
    >
      <Icon
        icon={playing ? "mdi:pause" : "mdi:play"}
        size={18}
        className={cn(heard && "text-sky-500 dark:text-sky-400")}
      />
    </Button>
  );
}

/**
 * Cyclic playback-speed chip (1× → 1,5× → 2×). The label is the state, so no
 * separate "active" indicator is needed; dimmed at 1× to avoid competing with
 * the play button. A pseudo-element extends the hit-area to ≥44px (WCAG 2.5.8)
 * without inflating the visual height.
 */
function PlaybackRateChip({ rate, onCycle }: { rate: number; onCycle: () => void }) {
  return (
    <button
      type="button"
      onClick={onCycle}
      aria-label={`Velocidade de reprodução ${formatPlaybackRate(rate)}. Toque para alterar.`}
      className={cn(
        "relative shrink-0 select-none rounded-full border px-1.5 text-[11px] font-semibold tabular-nums",
        "h-6 min-w-[34px] transition-colors",
        "before:absolute before:inset-[-9px] before:content-['']",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
        rate === 1
          ? "border-transparent bg-muted-foreground/10 text-muted-foreground opacity-70 hover:bg-muted-foreground/20 hover:opacity-100"
          : "border-primary/30 bg-primary/10 text-primary hover:bg-primary/15",
      )}
    >
      {formatPlaybackRate(rate)}
    </button>
  );
}

/** Waveform bars. When `onSeek` is provided, a click maps the x-position to a
 *  0-1 ratio for scrubbing. */
function WaveBars({
  bars,
  playedRatio,
  onSeek,
}: {
  bars: number[];
  playedRatio: number;
  onSeek?: (ratio: number) => void;
}) {
  return (
    <div
      className={`flex h-8 flex-1 items-center gap-[2px]${onSeek ? " cursor-pointer" : ""}`}
      onClick={
        onSeek
          ? (e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const ratio = rect.width > 0 ? (e.clientX - rect.left) / rect.width : 0;
              onSeek(Math.max(0, Math.min(1, ratio)));
            }
          : undefined
      }
    >
      {bars.map((h, i) => {
        const played = i / bars.length <= playedRatio;
        return (
          <div
            key={i}
            className={played ? "bg-primary" : "bg-muted-foreground/40"}
            style={{ width: 3, height: `${h}%`, borderRadius: 2 }}
          />
        );
      })}
    </div>
  );
}

/** Real playback backed by an `<audio>` element fed a signed/absolute URL. */
function RealAudioPlayer({
  url,
  message,
  onRetry,
}: {
  url: string;
  message: IMessage;
  onRetry?: () => void;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [errored, setErrored] = useState(false);
  const [rate, setRate] = useState<number>(() =>
    sanitizePlaybackRate(
      typeof window !== "undefined"
        ? window.localStorage.getItem(PLAYBACK_RATE_STORAGE_KEY)
        : null,
    ),
  );
  const bars = useMemo(() => generateWave(message.id), [message.id]);

  // Opus voice notes occasionally report a non-finite duration until a seek
  // happens — fall back to the deterministic estimate just for the visuals.
  const fallbackDuration = fakeAudioSeconds(message);
  const effDuration = duration > 0 && Number.isFinite(duration) ? duration : fallbackDuration;
  const playedRatio = effDuration > 0 ? Math.min(1, current / effDuration) : 0;
  // Outbound voice note the customer already listened to (PLAYED → read).
  const heard = message.direction === "out" && message.status === "read";

  // Keep the <audio> element's rate in sync (also re-applied on src/metadata
  // load below, since some browsers reset playbackRate on load).
  useEffect(() => {
    const el = audioRef.current;
    if (el) el.playbackRate = rate;
  }, [rate, url]);

  function toggle() {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) void el.play().catch(() => setErrored(true));
    else el.pause();
  }

  function cycleRate() {
    setRate((prev) => {
      const next = nextPlaybackRate(prev);
      try {
        window.localStorage.setItem(PLAYBACK_RATE_STORAGE_KEY, String(next));
      } catch {
        // Storage unavailable (private mode / quota) — preference is best-effort.
      }
      return next;
    });
  }

  function seek(ratio: number) {
    const el = audioRef.current;
    if (!el) return;
    const d = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : effDuration;
    el.currentTime = ratio * d;
    setCurrent(el.currentTime);
  }

  if (errored) return <AudioStub message={message} onRetry={onRetry} />;

  return (
    <BubbleChrome message={message} onRetry={onRetry}>
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
          // Re-apply the rate: browsers reset playbackRate to 1 on load.
          e.currentTarget.playbackRate = rate;
          const d = e.currentTarget.duration;
          if (Number.isFinite(d) && d > 0) setDuration(d);
        }}
        onError={() => setErrored(true)}
      />
      <div className="flex items-center gap-2.5">
        <PlayPauseButton playing={playing} onClick={toggle} heard={heard} />
        <WaveBars bars={bars} playedRatio={playedRatio} onSeek={seek} />
        <span className="shrink-0 min-w-[34px] text-right text-[11px] font-medium leading-none text-muted-foreground tabular-nums">
          {formatDuration(playing || current > 0 ? current : effDuration)}
        </span>
        <PlaybackRateChip rate={rate} onCycle={cycleRate} />
        <button
          type="button"
          onClick={() =>
            triggerMediaDownload(
              url,
              downloadFileName({ mediaType: message.mediaType, id: message.id, caption: message.text }),
            )
          }
          aria-label={CONVERSATION_STRINGS.downloadAudio}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Icon icon="mdi:download" size={15} />
        </button>
      </div>
      <TranscriptionCaption message={message} />
    </BubbleChrome>
  );
}

/**
 * Renders the transcription state below the waveform, or nothing when it
 * doesn't apply (old message, non-audio, or the feature was off on arrival).
 * `pending`/`done`/`failed` come from `IMessage.transcriptionStatus`, written
 * server-side by transcribeMessageAudio (webhook trigger or manual retry) and
 * delivered here via Realtime — no polling, no local state for the value itself.
 */
function TranscriptionCaption({ message }: { message: IMessage }) {
  const { retry, isPending, pendingMessageId } = useRetryTranscription();
  const status = message.transcriptionStatus;

  if (!status) return null;

  if (status === "pending") {
    return (
      <p className="mt-1.5 flex items-center gap-1 text-[10px] text-muted-foreground">
        <Icon icon="mdi:loading" size={11} className="animate-spin" />
        {CONVERSATION_STRINGS.transcribingAudio}
      </p>
    );
  }

  if (status === "done") {
    return <p className="mt-1.5 text-[10px] text-muted-foreground">{message.transcription}</p>;
  }

  const retrying = isPending && pendingMessageId === message.id;
  return (
    <button
      type="button"
      onClick={() => retry(message.id)}
      disabled={retrying}
      aria-label={CONVERSATION_STRINGS.retryTranscription}
      className="mt-1.5 flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground disabled:opacity-60"
    >
      <Icon icon={retrying ? "mdi:loading" : "mdi:refresh"} size={11} className={retrying ? "animate-spin" : undefined} />
      {CONVERSATION_STRINGS.transcriptionUnavailable}
    </button>
  );
}

/** Cosmetic waveform animation used in demonstração (no real bytes to play). */
function SimulatedAudioPlayer({ message, onRetry }: { message: IMessage; onRetry?: () => void }) {
  const totalSeconds = fakeAudioSeconds(message);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const startedAt = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const bars = useMemo(() => generateWave(message.id), [message.id]);

  useEffect(() => {
    if (!playing) return;
    startedAt.current = performance.now() - progress * 1000;
    const tick = () => {
      if (startedAt.current === null) return;
      const elapsed = (performance.now() - startedAt.current) / 1000;
      if (elapsed >= totalSeconds) {
        setPlaying(false);
        setProgress(totalSeconds);
        return;
      }
      setProgress(elapsed);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [playing, totalSeconds, progress]);

  const playedRatio = Math.min(1, progress / totalSeconds);
  const heard = message.direction === "out" && message.status === "read";

  return (
    <BubbleChrome message={message} onRetry={onRetry}>
      <div className="flex items-center gap-2.5">
        <PlayPauseButton
          playing={playing}
          heard={heard}
          onClick={() => {
            if (progress >= totalSeconds) setProgress(0);
            setPlaying((p) => !p);
          }}
        />
        <WaveBars bars={bars} playedRatio={playedRatio} />
        <span className="shrink-0 min-w-[34px] text-right text-[11px] font-medium leading-none text-muted-foreground tabular-nums">
          {formatDuration(playing ? progress : totalSeconds - progress)}
        </span>
      </div>
    </BubbleChrome>
  );
}

/** Loading / unavailable placeholder for real audio (no playable file). */
function AudioStub({
  message,
  onRetry,
  loading = false,
}: {
  message: IMessage;
  onRetry?: () => void;
  loading?: boolean;
}) {
  return (
    <BubbleChrome message={message} onRetry={onRetry}>
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon
          icon={loading ? "mdi:loading" : "mdi:microphone-off"}
          className={loading ? "animate-spin" : undefined}
          size={16}
        />
        <span className="text-xs">{loading ? "Carregando áudio…" : "Áudio indisponível"}</span>
      </div>
    </BubbleChrome>
  );
}
