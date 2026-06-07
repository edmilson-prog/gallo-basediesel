// src/features/media/components/AnnotationLayer.tsx
import type { IMediaAnnotation } from "@/shared/types";
import { cn } from "@/lib/utils";

/** IMediaAnnotation.color stores a severity TOKEN NAME → Tailwind text color class. */
const FALLBACK_TONE = "text-severity-info";
const ANNOTATION_TONE: Record<string, string> = {
  critical: "text-severity-critical",
  warning: "text-severity-warning",
  info: FALLBACK_TONE,
  success: "text-severity-success",
};

/** Resolve a token name to its class; default to info if unknown. */
export function annotationToneClass(color: string): string {
  return ANNOTATION_TONE[color] ?? FALLBACK_TONE;
}

interface IAnnotationLayerProps {
  annotations: IMediaAnnotation[];
  /** Extra classes for the wrapping <svg> (e.g. "absolute inset-0"). */
  className?: string;
}

/**
 * Read-only SVG render of normalized annotations (point/arrow/text).
 * `currentColor` lets the token-name → text-color class drive stroke/fill,
 * so the actual hue resolves from the design-system severity tokens (D-14).
 */
export function AnnotationLayer({ annotations, className }: IAnnotationLayerProps) {
  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className={cn("pointer-events-none h-full w-full", className)}
      aria-hidden
    >
      <defs>
        <marker id="annlayer-arrowhead" markerWidth="4" markerHeight="4" refX="2" refY="2" orient="auto">
          <path d="M0,0 L4,2 L0,4 Z" fill="currentColor" />
        </marker>
      </defs>
      {annotations.map((a) => (
        <g key={a.id} className={annotationToneClass(a.color)} stroke="currentColor" fill="currentColor">
          {a.type === "arrow" && a.x2 != null && a.y2 != null && (
            <line
              x1={a.x * 100} y1={a.y * 100} x2={a.x2 * 100} y2={a.y2 * 100}
              strokeWidth={0.8} markerEnd="url(#annlayer-arrowhead)"
            />
          )}
          <circle cx={a.x * 100} cy={a.y * 100} r={1.2} />
          {a.label && (
            <text x={a.x * 100 + 2} y={a.y * 100} fontSize={3} stroke="none">{a.label}</text>
          )}
        </g>
      ))}
    </svg>
  );
}
