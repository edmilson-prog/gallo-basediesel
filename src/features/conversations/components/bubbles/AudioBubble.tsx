import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { IMessage } from "@/shared/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { getActiveDataSource } from "@/providers/data";
import { BubbleChrome, type IBubbleProps } from "./bubbleChrome";
import { fakeAudioSeconds, formatDuration } from "../../utils/messageDisplay";
import { generateWaveBars } from "../../utils/audioWaveform";
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

const BAR_COUNT = 56;

/**
 * Fixed body width shared by EVERY audio state (player, demo, loading,
 * unavailable). The bubble is shrink-to-fit, so until now its width was
 * dictated by the transcription: ~300px with no caption, ~810px with a long
 * one, and every value in between. Pinning it here makes the audio column read
 * as a single ruler and keeps the caption near 68 characters per line — the
 * comfortable measure for 14px body text. `max-w-full` yields to the chrome's
 * 78% cap on narrow threads instead of overflowing it.
 */
const AUDIO_BODY = "w-[30rem] max-w-full";

/** Seek step (seconds) for the keyboard-accessible waveform scrubber. */
const SEEK_STEP_SECONDS = 5;

/**
 * Transcriptions longer than this collapse behind "Ver mais". At ~68 chars per
 * line this is roughly the 4-line clamp, with slack so captions that already
 * fit don't get a pointless button.
 */
const TRANSCRIPTION_CLAMP_CHARS = 300;

/**
 * Deterministic pseudo-waveform, remapped from the shared 20–100 generator onto
 * 42–100: a 20% bar rendered ~6px tall, which reads as a rendering glitch
 * rather than as a quiet passage.
 */
function waveHeights(seed: string): number[] {
  return generateWaveBars(seed, BAR_COUNT).map((v) => 42 + (v - 20) * 0.725);
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
export function AudioBubble({ message, onRetry, ...extras }: IBubbleProps) {
  const isDemo = getActiveDataSource() === "mock";
  // In demo mode there is no real file to sign — skip the query entirely.
  const { data: url, isLoading } = useResolvedMediaUrl(isDemo ? undefined : message.mediaUrl);

  if (isDemo) return <SimulatedAudioPlayer message={message} onRetry={onRetry} {...extras} />;
  if (url) return <RealAudioPlayer url={url} message={message} onRetry={onRetry} {...extras} />;
  if (isLoading && message.mediaUrl)
    return <AudioStub message={message} onRetry={onRetry} loading {...extras} />;
  return <AudioStub message={message} onRetry={onRetry} {...extras} />;
}

/**
 * Shared play/pause control. When `heard` is set (outbound voice note the
 * recipient already played → status `read`), the icon turns to the info
 * severity token, mirroring WhatsApp's "voice note listened" cue without
 * inventing a second status system.
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
      // A faint resting surface: as a bare ghost the primary control of the
      // bubble did not read as a button at all.
      className="h-9 w-9 shrink-0 rounded-full bg-foreground/5 p-0 transition-transform hover:bg-foreground/10 active:scale-95 motion-reduce:transition-none motion-reduce:active:scale-100"
      onClick={onClick}
      aria-label={playing ? "Pausar áudio" : "Reproduzir áudio"}
    >
      <Icon
        icon={playing ? "mdi:pause" : "mdi:play"}
        size={18}
        className={cn(heard && "text-severity-info")}
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

/**
 * Waveform bars plus the playhead. When `onSeek` is provided the strip becomes
 * a real slider: click maps the x-position to a 0-1 ratio, and ←/→/Home/End
 * scrub from the keyboard (the control used to be mouse-only).
 */
function WaveBars({
  bars,
  playedRatio,
  currentSeconds = 0,
  durationSeconds = 0,
  onSeek,
}: {
  bars: number[];
  playedRatio: number;
  currentSeconds?: number;
  durationSeconds?: number;
  onSeek?: (ratio: number) => void;
}) {
  const seekable = Boolean(onSeek);
  const total = Math.max(0, Math.round(durationSeconds));
  const at = Math.min(total, Math.max(0, Math.round(currentSeconds)));

  function seekBy(deltaSeconds: number) {
    if (!onSeek || durationSeconds <= 0) return;
    onSeek(Math.max(0, Math.min(1, (at + deltaSeconds) / durationSeconds)));
  }

  return (
    <div
      // `-my-2 py-2` grows the pointer target to 44px (WCAG 2.5.8) without
      // changing the visual height of the strip.
      className={cn(
        "relative -my-2 flex h-7 flex-1 items-center py-2",
        seekable &&
          "cursor-pointer rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      )}
      role={seekable ? "slider" : undefined}
      tabIndex={seekable ? 0 : undefined}
      aria-label={seekable ? CONVERSATION_STRINGS.audioPosition : undefined}
      aria-valuemin={seekable ? 0 : undefined}
      aria-valuemax={seekable ? total : undefined}
      aria-valuenow={seekable ? at : undefined}
      aria-valuetext={seekable ? `${formatDuration(at)} de ${formatDuration(total)}` : undefined}
      onKeyDown={
        seekable
          ? (e) => {
              if (e.key === "ArrowRight") {
                e.preventDefault();
                seekBy(SEEK_STEP_SECONDS);
              } else if (e.key === "ArrowLeft") {
                e.preventDefault();
                seekBy(-SEEK_STEP_SECONDS);
              } else if (e.key === "Home") {
                e.preventDefault();
                onSeek?.(0);
              } else if (e.key === "End") {
                e.preventDefault();
                onSeek?.(1);
              }
            }
          : undefined
      }
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
      <div className="flex h-full w-full items-center gap-[2px] overflow-hidden">
        {bars.map((h, i) => {
          const played = i / bars.length <= playedRatio;
          return (
            <div
              key={i}
              // `flex-1` spreads the bars across the whole (now fixed) width.
              // With the old fixed 3px bars a wide bubble left ~400px of dead
              // space between the waveform and the duration.
              className={cn(
                "min-w-[2px] flex-1 rounded-full",
                played ? "bg-primary" : "bg-muted-foreground/50",
              )}
              style={{ height: `${h}%` }}
            />
          );
        })}
      </div>
      {playedRatio > 0 && (
        <span
          aria-hidden
          className="pointer-events-none absolute top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary"
          style={{ left: `${Math.min(100, playedRatio * 100)}%` }}
        />
      )}
    </div>
  );
}

/** Real playback backed by an `<audio>` element fed a signed/absolute URL. */
function RealAudioPlayer({ url, message, onRetry, ...extras }: IBubbleProps & { url: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [errored, setErrored] = useState(false);
  const [rate, setRate] = useState<number>(() =>
    sanitizePlaybackRate(
      typeof window !== "undefined" ? window.localStorage.getItem(PLAYBACK_RATE_STORAGE_KEY) : null,
    ),
  );
  const bars = useMemo(() => waveHeights(message.id), [message.id]);

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
    <BubbleChrome message={message} onRetry={onRetry} {...extras}>
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
      <div className={AUDIO_BODY}>
        <div className="flex items-center gap-3">
          <PlayPauseButton playing={playing} onClick={toggle} heard={heard} />
          <WaveBars
            bars={bars}
            playedRatio={playedRatio}
            currentSeconds={current}
            durationSeconds={effDuration}
            onSeek={seek}
          />
          {/* Secondary controls read as one cluster instead of three loose
              items competing with the waveform. */}
          <div className="flex shrink-0 items-center gap-1.5">
            <span className="min-w-[34px] text-right text-[11px] font-medium leading-none text-muted-foreground/70 tabular-nums">
              {formatDuration(playing || current > 0 ? current : effDuration)}
            </span>
            <PlaybackRateChip rate={rate} onCycle={cycleRate} />
            <button
              type="button"
              onClick={() =>
                triggerMediaDownload(
                  url,
                  downloadFileName({
                    mediaType: message.mediaType,
                    id: message.id,
                    caption: message.text,
                  }),
                )
              }
              aria-label={CONVERSATION_STRINGS.downloadAudio}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground/70 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Icon icon="mdi:download" size={15} />
            </button>
          </div>
        </div>
        <TranscriptionCaption message={message} />
      </div>
    </BubbleChrome>
  );
}

/** Hairline + spacing shared by every transcription state, so the block sits in
 *  the same place whether it is loading, ready or failed. */
function TranscriptionShell({ children }: { children: ReactNode }) {
  // `border-foreground/10` instead of `border-border`: in dark mode `--border`
  // is already rgba(255,255,255,0.08), which all but disappears over the
  // outbound `bg-primary/10` surface.
  return <div className="mt-2 border-t border-foreground/10 pt-2">{children}</div>;
}

/** Small uppercase eyebrow — the only cue that the text was produced by a
 *  machine and may contain errors. */
function TranscriptionLabel({
  icon,
  spinning = false,
  children,
}: {
  icon: string;
  spinning?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="mb-1 flex items-center gap-1 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground/70">
      <Icon
        icon={icon}
        size={11}
        aria-hidden
        className={spinning ? "animate-spin motion-reduce:animate-none" : undefined}
      />
      {children}
    </div>
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
  const [expanded, setExpanded] = useState(false);
  const status = message.transcriptionStatus;

  if (!status) return null;

  if (status === "pending") {
    return (
      <TranscriptionShell>
        <TranscriptionLabel icon="mdi:loading" spinning>
          {CONVERSATION_STRINGS.transcribingAudio}
        </TranscriptionLabel>
        {/* Two skeleton lines reserve most of the height the caption will take,
            so the bubble barely moves when Realtime delivers the text. */}
        <div className="space-y-1.5" aria-hidden>
          <div className="h-3 w-full animate-pulse rounded bg-muted-foreground/15 motion-reduce:animate-none" />
          <div className="h-3 w-3/5 animate-pulse rounded bg-muted-foreground/15 motion-reduce:animate-none" />
        </div>
      </TranscriptionShell>
    );
  }

  if (status === "done") {
    const text = message.transcription?.trim();
    if (!text) return null;
    const clampable = text.length > TRANSCRIPTION_CLAMP_CHARS;
    return (
      <TranscriptionShell>
        <TranscriptionLabel icon="mdi:text-recognition">
          {CONVERSATION_STRINGS.transcriptionLabel}
        </TranscriptionLabel>
        {/* Body size (14px) + italic: the caption is often the only way to read
            the audio without headphones, so it can't look like a footnote —
            the italic keeps it legible as machine output, not as a quote. */}
        <p
          className={cn(
            "whitespace-pre-wrap break-words text-sm italic leading-relaxed text-foreground/85",
            clampable && !expanded && "line-clamp-4",
          )}
        >
          {text}
        </p>
        {clampable && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="mt-1 rounded text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {expanded
              ? CONVERSATION_STRINGS.transcriptionShowLess
              : CONVERSATION_STRINGS.transcriptionShowMore}
          </button>
        )}
      </TranscriptionShell>
    );
  }

  const retrying = isPending && pendingMessageId === message.id;
  return (
    <TranscriptionShell>
      <button
        type="button"
        onClick={() => retry(message.id)}
        disabled={retrying}
        aria-label={CONVERSATION_STRINGS.retryTranscription}
        className="flex items-center gap-1.5 rounded text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
      >
        <Icon
          icon={retrying ? "mdi:loading" : "mdi:refresh"}
          size={13}
          className={retrying ? "animate-spin motion-reduce:animate-none" : undefined}
        />
        {CONVERSATION_STRINGS.transcriptionUnavailable}
      </button>
    </TranscriptionShell>
  );
}

/** Cosmetic waveform animation used in demonstração (no real bytes to play). */
function SimulatedAudioPlayer({ message, onRetry, ...extras }: IBubbleProps) {
  const totalSeconds = fakeAudioSeconds(message);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const startedAt = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const bars = useMemo(() => waveHeights(message.id), [message.id]);

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
    <BubbleChrome message={message} onRetry={onRetry} {...extras}>
      <div className={AUDIO_BODY}>
        <div className="flex items-center gap-3">
          <PlayPauseButton
            playing={playing}
            heard={heard}
            onClick={() => {
              if (progress >= totalSeconds) setProgress(0);
              setPlaying((p) => !p);
            }}
          />
          <WaveBars bars={bars} playedRatio={playedRatio} />
          <span className="min-w-[34px] shrink-0 text-right text-[11px] font-medium leading-none text-muted-foreground/70 tabular-nums">
            {formatDuration(playing ? progress : totalSeconds - progress)}
          </span>
        </div>
      </div>
    </BubbleChrome>
  );
}

/** Loading / unavailable placeholder for real audio (no playable file). */
function AudioStub({
  message,
  onRetry,
  loading = false,
  ...extras
}: IBubbleProps & { loading?: boolean }) {
  return (
    <BubbleChrome message={message} onRetry={onRetry} {...extras}>
      {/* Same width and row height as the player, so the bubble doesn't jump
          when the signed URL resolves. */}
      <div className={cn(AUDIO_BODY, "flex h-9 items-center gap-2 text-muted-foreground")}>
        <Icon
          icon={loading ? "mdi:loading" : "mdi:microphone-off"}
          className={loading ? "animate-spin motion-reduce:animate-none" : undefined}
          size={16}
        />
        <span className="text-xs">{loading ? "Carregando áudio…" : "Áudio indisponível"}</span>
      </div>
    </BubbleChrome>
  );
}
