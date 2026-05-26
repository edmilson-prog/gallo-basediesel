import { useEffect, useRef, useState } from "react";
import type { IMessage } from "@/shared/types";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { BubbleChrome } from "./bubbleChrome";
import { fakeAudioSeconds, formatDuration } from "../../utils/messageDisplay";
import { CONVERSATION_STRINGS } from "../../i18n/pt-BR";

const BAR_COUNT = 32;

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

export function AudioBubble({ message, onRetry }: { message: IMessage; onRetry?: () => void }) {
  const totalSeconds = fakeAudioSeconds(message);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const startedAt = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const bars = generateWave(message.id);

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

  return (
    <BubbleChrome message={message} onRetry={onRetry}>
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          className="h-9 w-9 shrink-0 rounded-full p-0"
          onClick={() => {
            if (progress >= totalSeconds) setProgress(0);
            setPlaying((p) => !p);
          }}
          aria-label={playing ? "Pausar áudio" : "Reproduzir áudio"}
        >
          <Icon icon={playing ? "mdi:pause" : "mdi:play"} size={18} />
        </Button>
        <div className="flex h-8 flex-1 items-center gap-[2px]">
          {bars.map((h, i) => {
            const ratio = i / BAR_COUNT;
            const played = ratio <= playedRatio;
            return (
              <div
                key={i}
                className={played ? "bg-primary" : "bg-muted-foreground/40"}
                style={{ width: 3, height: `${h}%`, borderRadius: 2 }}
              />
            );
          })}
        </div>
        <span className="shrink-0 text-[11px] font-medium text-muted-foreground tabular-nums">
          {formatDuration(playing ? progress : totalSeconds - progress)}
        </span>
      </div>
      <p className="mt-1 text-[10px] text-muted-foreground">
        {CONVERSATION_STRINGS.audioTranscription}
      </p>
    </BubbleChrome>
  );
}
