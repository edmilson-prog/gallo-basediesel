import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { triggerMediaDownload } from "@/features/conversations/utils/mediaDownload";
import {
  FIT_SCALE,
  TAP_SLOP_PX,
  clampPan,
  clampScale,
  distanceBetween,
  isDoubleTap,
  panBounds,
  toggleZoom,
  type IPoint,
  type ISize,
  type ITapSample,
} from "../../engine/imageZoom";
import { PWA_ATENDIMENTO_STRINGS as S } from "../../i18n/pt-BR";

export type PwaViewerKind = "image" | "video";

interface IPwaMediaViewerProps {
  open: boolean;
  onClose: () => void;
  kind: PwaViewerKind;
  /** URL já resolvida (assinada) — quem abre o visualizador já a tinha em mãos. */
  url: string | null;
  caption?: string | null;
  /** Nome com que o arquivo é salvo no aparelho. */
  fileName: string;
}

/**
 * Mídia em tela cheia.
 *
 * Fechado, não monta nada: um `<video autoPlay>` montado atrás de um `hidden`
 * baixaria o arquivo de qualquer jeito, e conversa de oficina é vista em rede
 * de celular.
 */
export function PwaMediaViewer(props: IPwaMediaViewerProps) {
  if (!props.open) return null;
  return <ViewerBody {...props} />;
}

/**
 * Corpo do visualizador.
 *
 * Os gestos são tratados aqui com Pointer Events e `touch-action: none` em vez
 * do zoom nativo do navegador: o app roda dentro de um `fixed inset-0`, onde a
 * pinça do sistema mexeria na página inteira (quando o iOS em modo app sequer
 * permite) — e não na foto. Toda a conta de enquadramento mora em
 * `engine/imageZoom`, testada sem aparelho.
 */
function ViewerBody({ onClose, kind, url, caption, fileName }: IPwaMediaViewerProps) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(FIT_SCALE);
  const [offset, setOffset] = useState<IPoint>({ x: 0, y: 0 });
  const [natural, setNatural] = useState<ISize>({ width: 0, height: 0 });
  const [panning, setPanning] = useState(false);

  const pointers = useRef(new Map<number, IPoint>());
  const pinch = useRef<{ spread: number; scale: number } | null>(null);
  const drag = useRef<{ from: IPoint; origin: IPoint } | null>(null);
  const lastTap = useRef<ITapSample | null>(null);
  const moved = useRef(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const stageSize = useCallback((): ISize => {
    const rect = stageRef.current?.getBoundingClientRect();
    return { width: rect?.width ?? 0, height: rect?.height ?? 0 };
  }, []);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    moved.current = false;

    const points = [...pointers.current.values()];
    const [first, second] = points;
    if (points.length === 2 && first && second) {
      pinch.current = { spread: distanceBetween(first, second), scale };
      drag.current = null;
      return;
    }
    if (points.length === 1) {
      drag.current = { from: { x: event.clientX, y: event.clientY }, origin: offset };
      setPanning(true);
    }
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    const viewport = stageSize();
    const points = [...pointers.current.values()];
    const [first, second] = points;
    const gesture = pinch.current;

    if (points.length >= 2 && gesture && first && second) {
      moved.current = true;
      if (gesture.spread <= 0) return;
      const next = clampScale((gesture.scale * distanceBetween(first, second)) / gesture.spread);
      setScale(next);
      setOffset((current) => clampPan(current, panBounds(natural, viewport, next)));
      return;
    }

    const dragging = drag.current;
    if (!dragging) return;
    const dx = event.clientX - dragging.from.x;
    const dy = event.clientY - dragging.from.y;
    if (Math.hypot(dx, dy) > TAP_SLOP_PX) moved.current = true;
    // Encaixada, não há para onde arrastar — mas o gesto ainda precisa contar
    // como movimento, senão vira "toque" e dispara o zoom sem querer.
    if (scale <= FIT_SCALE) return;
    setOffset(
      clampPan(
        { x: dragging.origin.x + dx, y: dragging.origin.y + dy },
        panBounds(natural, viewport, scale),
      ),
    );
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size > 0) return;

    drag.current = null;
    setPanning(false);
    if (scale <= FIT_SCALE) setOffset({ x: 0, y: 0 });

    if (moved.current) {
      lastTap.current = null;
      return;
    }

    const rect = stageRef.current?.getBoundingClientRect();
    const point = {
      x: event.clientX - (rect?.left ?? 0),
      y: event.clientY - (rect?.top ?? 0),
    };
    const sample: ITapSample = { at: event.timeStamp, point };

    if (isDoubleTap(lastTap.current, sample)) {
      lastTap.current = null;
      const next = toggleZoom({ scale }, point, stageSize(), natural);
      setScale(next.scale);
      setOffset(next.offset);
      return;
    }
    lastTap.current = sample;
  };

  const gestures =
    kind === "image"
      ? {
          onPointerDown: handlePointerDown,
          onPointerMove: handlePointerMove,
          onPointerUp: handlePointerUp,
          onPointerCancel: handlePointerUp,
        }
      : {};

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={S.viewer.title}
      className="fixed inset-0 z-[60] flex flex-col bg-background pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]"
    >
      <div className="flex shrink-0 items-center gap-1 border-b border-border px-1">
        <button
          type="button"
          onClick={onClose}
          aria-label={S.viewer.close}
          className="flex h-11 w-11 shrink-0 items-center justify-center text-foreground"
        >
          <Icon icon="mdi:close" size={22} />
        </button>
        <span className="min-w-0 flex-1 truncate text-[12px] text-muted-foreground">
          {fileName}
        </span>
        {url && (
          <button
            type="button"
            onClick={() => triggerMediaDownload(url, fileName)}
            aria-label={S.viewer.download}
            className="flex h-11 w-11 shrink-0 items-center justify-center text-foreground"
          >
            <Icon icon="mdi:download" size={20} />
          </button>
        )}
      </div>

      <div
        ref={stageRef}
        className={cn(
          "relative flex min-h-0 flex-1 items-center justify-center overflow-hidden",
          kind === "image" && "touch-none",
        )}
        {...gestures}
      >
        {!url ? (
          <p className="flex flex-col items-center gap-2 text-[13.5px] text-muted-foreground">
            <Icon icon="mdi:image-broken-variant" size={28} />
            {S.viewer.unavailable}
          </p>
        ) : kind === "video" ? (
          <video src={url} controls autoPlay playsInline className="max-h-full max-w-full" />
        ) : (
          <img
            src={url}
            alt={caption?.trim() || S.viewer.title}
            draggable={false}
            onLoad={(event) =>
              setNatural({
                width: event.currentTarget.naturalWidth,
                height: event.currentTarget.naturalHeight,
              })
            }
            className="max-h-full max-w-full select-none object-contain"
            style={{
              transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${scale})`,
              transition: panning ? "none" : "transform 180ms cubic-bezier(0.16, 1, 0.3, 1)",
            }}
          />
        )}
      </div>

      {kind === "image" && url && (
        // Altura fixa: o texto some ao aproximar, mas a faixa fica — a foto não
        // pode dar um pulo de 18 px a cada toque duplo.
        <p className="flex h-[18px] shrink-0 items-center justify-center text-[11px] font-semibold text-muted-foreground/70">
          {scale === FIT_SCALE ? S.viewer.zoomHint : ""}
        </p>
      )}

      {caption?.trim() && (
        <p className="max-h-[26svh] shrink-0 overflow-auto border-t border-border px-4 py-3 text-[13.5px] leading-snug text-foreground">
          {caption.trim()}
        </p>
      )}
    </div>
  );
}
