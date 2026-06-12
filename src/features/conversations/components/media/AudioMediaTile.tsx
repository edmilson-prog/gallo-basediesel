import { useMemo, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { useResolvedMediaUrl } from "../../hooks/useResolvedMediaUrl";
import { formatDuration, estimateAudioSeconds } from "../../utils/messageDisplay";
import { generateWaveBars } from "../../utils/audioWaveform";
import type { IConversationMediaItem } from "../../engine/conversationMedia";

const BAR_COUNT = 20;

// Only one panel audio tile plays at a time: claiming playback pauses the
// previously active element (module-scoped so it spans every tile instance).
let activePanelAudio: HTMLAudioElement | null = null;
function claimPlayback(el: HTMLAudioElement) {
  if (activePanelAudio && activePanelAudio !== el) activePanelAudio.pause();
  activePanelAudio = el;
}
function releasePlayback(el: HTMLAudioElement) {
  if (activePanelAudio === el) activePanelAudio = null;
}

/** Local-time `dd mmm` / `HH:mm` split for the tile footer. */
function dateTimeLabel(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }),
    time: d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
  };
}

/**
 * Audio tile rendered as an inline mini-player: play/pause without opening the
 * viewer, a scrub-free progress waveform, real duration (read from the file's
 * metadata, falling back to a deterministic estimate while it loads), the
 * Recebido/Enviado direction and the send date/time.
 */
export function AudioMediaTile({ item }: { item: IConversationMediaItem }) {
  const { data: url, isLoading } = useResolvedMediaUrl(item.mediaUrl);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const bars = useMemo(() => generateWaveBars(item.id, BAR_COUNT), [item.id]);

  // Opus voice notes sometimes report a non-finite duration until a seek — fall
  // back to the deterministic estimate purely for the visual counter.
  const effDuration =
    duration > 0 && Number.isFinite(duration) ? duration : estimateAudioSeconds(item.id);
  const playedRatio = effDuration > 0 ? Math.min(1, current / effDuration) : 0;
  const { date, time } = dateTimeLabel(item.sentAt);
  const incoming = item.direction === "in";
  const showElapsed = playing || current > 0;

  function toggle() {
    const el = audioRef.current;
    if (!el || !url) return;
    if (el.paused) void el.play().catch(() => {});
    else el.pause();
  }

  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border bg-muted/40 p-2 text-muted-foreground">
      {url && (
        <audio
          ref={audioRef}
          src={url}
          preload="metadata"
          className="hidden"
          onPlay={() => {
            if (audioRef.current) claimPlayback(audioRef.current);
            setPlaying(true);
          }}
          onPause={() => {
            if (audioRef.current) releasePlayback(audioRef.current);
            setPlaying(false);
          }}
          onEnded={() => {
            if (audioRef.current) releasePlayback(audioRef.current);
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

      {/* Play + waveform */}
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={toggle}
          disabled={!url}
          aria-label={playing ? "Pausar áudio" : "Reproduzir áudio"}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
        >
          <Icon
            icon={!url && isLoading ? "mdi:loading" : playing ? "mdi:pause" : "mdi:play"}
            className={!url && isLoading ? "animate-spin" : undefined}
            size={16}
          />
        </button>
        <div className="flex h-6 flex-1 items-center gap-[1.5px] overflow-hidden" aria-hidden>
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
      </div>

      {/* Direction + duration */}
      <div className="flex items-center gap-1 text-[10px]">
        <Icon icon={incoming ? "mdi:arrow-down" : "mdi:arrow-up"} size={11} aria-hidden />
        <span>{incoming ? "Recebido" : "Enviado"}</span>
        <span className="ml-auto font-medium tabular-nums">
          {formatDuration(showElapsed ? current : effDuration)}
        </span>
      </div>

      {/* Date · time */}
      <div className="text-[10px] tabular-nums">
        {date} · {time}
      </div>
    </div>
  );
}
