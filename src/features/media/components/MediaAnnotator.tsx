// src/features/media/components/MediaAnnotator.tsx
import { useRef, useState } from "react";
import type { IMediaAnnotation, IMediaAsset } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { normalizePoint } from "../engine/annotationCoords";
import { annotationToneClass } from "./AnnotationLayer";
import { useMediaActions } from "../hooks/useMediaActions";
import { MEDIA_STRINGS } from "../i18n/pt-BR";

type Tool = "select" | "point" | "arrow" | "text";

interface IMediaAnnotatorProps {
  asset: IMediaAsset;
  currentUserId: string;
  onClose: () => void;
}

// IMediaAnnotation.color stores a TOKEN NAME (not a raw CSS var) — mapped to a class by annotationToneClass (D-14).
const COLOR_TOKEN = "info";
const clamp01 = (n: number) => Math.min(Math.max(n, 0), 1);

export function MediaAnnotator({ asset, currentUserId, onClose }: IMediaAnnotatorProps) {
  const { annotate } = useMediaActions();
  const [tool, setTool] = useState<Tool>("select");
  const [items, setItems] = useState<IMediaAnnotation[]>(asset.annotations ?? []);
  const [saving, setSaving] = useState(false);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const t = MEDIA_STRINGS.annotator;

  const addAt = (clientX: number, clientY: number) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    if (tool === "select") return;
    const { x, y } = normalizePoint(
      { x: clientX - rect.left, y: clientY - rect.top },
      { width: rect.width, height: rect.height },
    );
    const base: IMediaAnnotation = {
      id: `ann-${crypto.randomUUID()}`,
      type: tool,
      x, y,
      color: COLOR_TOKEN,
      createdBy: currentUserId,
      createdAt: new Date().toISOString(),
      ...(tool === "arrow" ? { x2: Math.min(x + 0.1, 1), y2: Math.min(y + 0.1, 1) } : {}),
      ...(tool === "text" ? { label: "" } : {}),
    };
    setItems((prev) => [...prev, base]);
  };

  const update = (id: string, patch: Partial<IMediaAnnotation>) =>
    setItems((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  const remove = (id: string) => setItems((prev) => prev.filter((a) => a.id !== id));

  const nudge = (id: string, dx: number, dy: number) =>
    setItems((prev) => prev.map((a) =>
      a.id === id ? { ...a, x: clamp01(a.x + dx), y: clamp01(a.y + dy) } : a));

  const onListKey = (e: React.KeyboardEvent, id: string) => {
    const big = e.shiftKey ? 10 : 1;
    const step = big / 1000; // ~px→normalized on a ~1000px canvas; fine for mock
    if (e.key === "ArrowLeft") { e.preventDefault(); nudge(id, -step, 0); }
    else if (e.key === "ArrowRight") { e.preventDefault(); nudge(id, step, 0); }
    else if (e.key === "ArrowUp") { e.preventDefault(); nudge(id, 0, -step); }
    else if (e.key === "ArrowDown") { e.preventDefault(); nudge(id, 0, step); }
  };

  const save = async () => {
    setSaving(true);
    try { await annotate(asset, items); onClose(); } finally { setSaving(false); }
  };

  return (
    <div className="flex h-full flex-col gap-2">
      <ToggleGroup type="single" value={tool} onValueChange={(v) => v && setTool(v as Tool)}
                   aria-label="Ferramenta de anotação" className="rounded-md border border-border p-0.5">
        {(["select", "point", "arrow", "text"] as Tool[]).map((tl) => (
          <ToggleGroupItem key={tl} value={tl} className="h-7 px-2 text-xs">
            <Icon icon={
              tl === "select" ? "mdi:cursor-default-outline"
                : tl === "point" ? "mdi:circle-small"
                : tl === "arrow" ? "mdi:arrow-top-right"
                : "mdi:format-text"
            } size={14} className="mr-1" />
            {t.tools[tl]}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      <div className="relative flex-1 overflow-hidden rounded-md bg-muted/40">
        <svg
          ref={svgRef}
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full"
          onClick={(e) => addAt(e.clientX, e.clientY)}
          role="application"
          aria-label="Camada de anotações"
        >
          <defs>
            <marker id="annotator-arrowhead" markerWidth="4" markerHeight="4" refX="2" refY="2" orient="auto"
                    className={annotationToneClass(COLOR_TOKEN)}>
              <path d="M0,0 L4,2 L0,4 Z" fill="currentColor" />
            </marker>
          </defs>
          {items.map((a) => (
            // color is a TOKEN NAME → text-color class; currentColor drives stroke/fill (D-14)
            <g key={a.id} className={annotationToneClass(a.color)} stroke="currentColor" fill="currentColor">
              {a.type === "arrow" && a.x2 != null && a.y2 != null && (
                <line x1={a.x * 100} y1={a.y * 100} x2={a.x2 * 100} y2={a.y2 * 100}
                      strokeWidth={0.8} markerEnd="url(#annotator-arrowhead)" />
              )}
              <circle cx={a.x * 100} cy={a.y * 100} r={1.2} />
              {a.label && (
                <text x={a.x * 100 + 2} y={a.y * 100} fontSize={3} stroke="none">{a.label}</text>
              )}
            </g>
          ))}
        </svg>
      </div>

      {/* accessible parallel list */}
      <div className="max-h-40 overflow-y-auto">
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {t.listTitle} · {items.length}
        </p>
        {items.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t.empty}</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {items.map((a, i) => (
              <li key={a.id} className="flex items-center gap-2 rounded border border-border bg-card px-2 py-1">
                <span
                  tabIndex={0}
                  onKeyDown={(e) => onListKey(e, a.id)}
                  aria-label={`${[t.tools[a.type], a.label].filter(Boolean).join(" ")} — Anotação ${i + 1} — ${t.nudgeHint}`}
                  className="cursor-grab rounded p-0.5 text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Icon icon="mdi:drag" size={14} />
                </span>
                <Input
                  value={a.label ?? ""}
                  onChange={(e) => update(a.id, { label: e.target.value })}
                  placeholder={t.labelPlaceholder}
                  className="h-7 flex-1 text-xs"
                />
                <button type="button" onClick={() => remove(a.id)} aria-label={t.remove}
                        className="rounded p-1 text-muted-foreground hover:text-severity-critical">
                  <Icon icon="mdi:trash-can-outline" size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className={cn("flex justify-end gap-2")}>
        <Button variant="outline" size="sm" onClick={onClose}>{t.cancel}</Button>
        <Button size="sm" onClick={save} disabled={saving}>{t.save}</Button>
      </div>
    </div>
  );
}
