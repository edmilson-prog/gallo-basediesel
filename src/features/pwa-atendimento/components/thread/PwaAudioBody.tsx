import { useEffect, useRef, useState } from "react";
import type { IMessage } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { generateWaveBars } from "@/features/conversations/utils/audioWaveform";
import { useResolvedMediaUrl } from "@/features/conversations/hooks/useResolvedMediaUrl";
import { PWA_ATENDIMENTO_STRINGS as S } from "../../i18n/pt-BR";

const BAR_COUNT = 34;

function formatClock(seconds: number): string {
  const safe = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
  const mm = String(Math.floor(safe / 60)).padStart(2, "0");
  const ss = String(Math.floor(safe % 60)).padStart(2, "0");
  return `${mm}:${ss}`;
}

/** Voice note: play/pause, a deterministic waveform, and the transcription. */
export function PwaAudioBody({ message, outgoing }: { message: IMessage; outgoing: boolean }) {
  const { data: url } = useResolvedMediaUrl(message.mediaUrl);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [duration, setDuration] = useState(0);

  const bars = generateWaveBars(message.id, BAR_COUNT);
  const progress = duration > 0 ? elapsed / duration : 0;
  const litBars = Math.round(progress * BAR_COUNT);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => setElapsed(audio.currentTime);
    const onMeta = () => setDuration(audio.duration);
    const onEnd = () => {
      setPlaying(false);
      setElapsed(0);
    };
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("ended", onEnd);
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("ended", onEnd);
    };
  }, [url]);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
      return;
    }
    void audio
      .play()
      .then(() => setPlaying(true))
      .catch(() => setPlaying(false));
  };

  return (
    <div className="min-w-[212px]">
      {url && <audio ref={audioRef} src={url} preload="metadata" />}
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={toggle}
          disabled={!url}
          aria-label={playing ? S.thread.pause : S.thread.play}
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded disabled:opacity-40",
            outgoing ? "bg-foreground/10" : "bg-background/10",
          )}
        >
          <Icon icon={playing ? "mdi:pause" : "mdi:play"} size={15} />
        </button>

        <span className="flex h-[26px] flex-1 items-center gap-[2px]" aria-hidden>
          {bars.map((height, index) => (
            <span
              key={index}
              className={cn(
                "w-[2.5px] rounded-sm",
                index < litBars
                  ? outgoing
                    ? "bg-primary"
                    : "bg-background/70"
                  : outgoing
                    ? "bg-foreground/30"
                    : "bg-background/30",
              )}
              style={{ height: 5 + (height % 16) }}
            />
          ))}
        </span>

        <span className="text-[11px] font-bold tabular-nums opacity-70">
          {formatClock(playing || elapsed > 0 ? duration - elapsed : duration)}
        </span>
      </div>

      {message.transcription && (
        <div
          className={cn(
            "mt-2.5 border-t pt-2.5",
            outgoing ? "border-border" : "border-background/20",
          )}
        >
          <p className="mb-1 text-[9.5px] font-bold uppercase tracking-[0.14em] opacity-60">
            {S.thread.transcription}
          </p>
          <p className="text-[13px] leading-snug opacity-90">{message.transcription}</p>
        </div>
      )}
    </div>
  );
}
