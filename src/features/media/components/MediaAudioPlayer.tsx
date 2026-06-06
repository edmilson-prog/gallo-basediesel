// src/features/media/components/MediaAudioPlayer.tsx
import { useCallback, useEffect, useRef, useState } from "react";
import type { IMediaAsset } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { highlightSegments } from "../engine/mediaFiltering";
import { MEDIA_STRINGS } from "../i18n/pt-BR";

const SPEED_KEY = "gallo-media-audio-speed";
const SPEEDS = ["1", "1.5", "2"] as const;
type Speed = (typeof SPEEDS)[number];

function readSpeed(): Speed {
  if (typeof window === "undefined") return "1";
  const raw = window.localStorage.getItem(SPEED_KEY);
  return (SPEEDS as readonly string[]).includes(raw ?? "") ? (raw as Speed) : "1";
}

interface IMediaAudioPlayerProps {
  asset: IMediaAsset;
  /** Search term to highlight in the transcript. */
  searchTerm?: string;
  /** Exposes play/pause so the lightbox Space key can toggle it. */
  registerToggle?: (toggle: () => void) => void;
}

/** Simulated audio player (no real bytes in Fase 1). Speed persists across items. */
export function MediaAudioPlayer({ asset, searchTerm, registerToggle }: IMediaAudioPlayerProps) {
  const a = MEDIA_STRINGS.audio;
  // Mock duration derived from size for determinism (seconds).
  const duration = Math.max(8, Math.round(asset.sizeBytes / 4000));
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0); // seconds
  const [speed, setSpeed] = useState<Speed>(() => readSpeed());
  const raf = useRef<number | null>(null);
  const last = useRef<number>(0);

  useEffect(() => {
    try { window.localStorage.setItem(SPEED_KEY, speed); } catch { /* ignore */ }
  }, [speed]);

  // Reset position when the asset changes (speed intentionally kept).
  useEffect(() => { setPos(0); setPlaying(false); }, [asset.id]);

  const toggle = useCallback(() => setPlaying((p) => !p), []);
  useEffect(() => { registerToggle?.(toggle); }, [registerToggle, toggle]);

  useEffect(() => {
    if (!playing) return;
    last.current = performance.now();
    const step = (t: number) => {
      const dt = ((t - last.current) / 1000) * Number(speed);
      last.current = t;
      setPos((prev) => {
        const next = prev + dt;
        if (next >= duration) { setPlaying(false); return duration; }
        return next;
      });
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [playing, speed, duration]);

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  const segments = asset.transcription ? highlightSegments(asset.transcription, searchTerm ?? "") : [];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <Button
          size="icon"
          variant="secondary"
          onClick={toggle}
          aria-label={playing ? a.pause : a.play}
          className="h-10 w-10 rounded-full"
        >
          <Icon icon={playing ? "mdi:pause" : "mdi:play"} size={20} />
        </Button>
        <div className="flex flex-1 items-center gap-2">
          <span className="w-9 text-[11px] tabular-nums text-muted-foreground">{fmt(pos)}</span>
          <Slider
            value={[pos]}
            max={duration}
            step={1}
            onValueChange={([v]) => setPos(v)}
            aria-label="Posição do áudio"
            className="flex-1"
          />
          <span className="w-9 text-[11px] tabular-nums text-muted-foreground">{fmt(duration)}</span>
        </div>
        <ToggleGroup
          type="single"
          value={speed}
          onValueChange={(v) => v && setSpeed(v as Speed)}
          aria-label={a.speed}
          className="rounded-md border border-border p-0.5"
        >
          {SPEEDS.map((sp) => (
            <ToggleGroupItem key={sp} value={sp} className="h-7 px-2 text-[11px]">
              {sp}x
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <div>
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {a.transcriptionLabel}
        </p>
        {segments.length === 0 ? (
          <p className="text-xs text-muted-foreground">{a.noTranscription}</p>
        ) : (
          <p className="text-xs leading-relaxed text-foreground">
            {segments.map((seg, i) =>
              seg.isMatch ? (
                <mark key={i} className="rounded bg-severity-info/25 px-0.5 text-foreground">
                  {seg.text}
                </mark>
              ) : (
                <span key={i}>{seg.text}</span>
              ),
            )}
          </p>
        )}
      </div>
    </div>
  );
}
