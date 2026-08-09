import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import {
  AVATAR_MAX_ZOOM,
  AVATAR_MIN_ZOOM,
  AVATAR_OUTPUT_QUALITY,
  AVATAR_OUTPUT_SIZE,
  AVATAR_ZOOM_STEP,
  clampOffset,
  clampZoom,
  cropRect,
  offsetForZoom,
  renderedSize,
  type IAvatarOffset,
  type IAvatarSize,
} from "../../engine/avatarCrop";

/**
 * Side of the on-screen framing area, in CSS pixels. Fixed on purpose: the pan
 * offset is expressed in these pixels, so a responsive viewport would have to
 * rescale the offset on every resize. 256 + the dialog padding still fits a
 * 320px-wide phone.
 */
const VIEWPORT_PX = 256;

/** Pan step for the arrow keys, in CSS pixels (Shift moves faster). */
const KEYBOARD_STEP = 6;
const KEYBOARD_STEP_FAST = 24;

/** Zoom step for the +/- keys and the wheel sensitivity factor. */
const KEYBOARD_ZOOM_STEP = 0.1;
const WHEEL_ZOOM_FACTOR = 0.0015;

type LoadStatus = "loading" | "ready" | "error";

interface IAvatarCropDialogProps {
  /** Picked file — the dialog is open while this is not null. */
  file: File | null;
  /** True while the parent is uploading the cropped result. */
  busy: boolean;
  onCancel: () => void;
  onConfirm: (cropped: File) => void;
}

/**
 * Encodes the framed square as a JPEG File.
 *
 * The white fill is not UI styling: JPEG has no alpha channel, so a transparent
 * PNG would otherwise flatten onto black.
 */
async function renderCroppedFile(
  image: HTMLImageElement,
  natural: IAvatarSize,
  zoom: number,
  offset: IAvatarOffset,
): Promise<File> {
  const rect = cropRect(natural, VIEWPORT_PX, zoom, offset);
  const canvas = document.createElement("canvas");
  canvas.width = AVATAR_OUTPUT_SIZE;
  canvas.height = AVATAR_OUTPUT_SIZE;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("[avatar] canvas 2d context unavailable");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, AVATAR_OUTPUT_SIZE, AVATAR_OUTPUT_SIZE);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(
    image,
    rect.sx,
    rect.sy,
    rect.size,
    rect.size,
    0,
    0,
    AVATAR_OUTPUT_SIZE,
    AVATAR_OUTPUT_SIZE,
  );

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/jpeg", AVATAR_OUTPUT_QUALITY);
  });
  if (!blob) throw new Error("[avatar] canvas.toBlob returned null");

  // The storage path is derived from the user id, so this name is cosmetic.
  return new File([blob], "avatar.jpg", { type: "image/jpeg" });
}

/**
 * Framing step shown between picking a photo and uploading it: drag to
 * position, zoom to fill, and the dashed circle previews the crop the app
 * actually shows. Exports a square 512px JPEG.
 */
export function AvatarCropDialog({ file, busy, onCancel, onConfirm }: IAvatarCropDialogProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number } | null>(null);
  const dragOriginRef = useRef<IAvatarOffset>({ x: 0, y: 0 });

  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [natural, setNatural] = useState<IAvatarSize | null>(null);
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState<IAvatarOffset>({ x: 0, y: 0 });
  const [rendering, setRendering] = useState(false);

  // Decode the picked file once and keep the element around: the same decoded
  // image feeds both the preview and the export canvas.
  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    const url = URL.createObjectURL(file);
    setObjectUrl(url);
    setStatus("loading");
    setNatural(null);
    setZoom(1);
    setOffset({ x: 0, y: 0 });

    const image = new Image();
    image.onload = () => {
      if (cancelled) return;
      imageRef.current = image;
      setNatural({ width: image.naturalWidth, height: image.naturalHeight });
      setStatus("ready");
    };
    image.onerror = () => {
      if (!cancelled) setStatus("error");
    };
    image.src = url;

    return () => {
      cancelled = true;
      imageRef.current = null;
      URL.revokeObjectURL(url);
    };
  }, [file]);

  const interactive = status === "ready" && natural !== null && !busy && !rendering;

  const applyZoom = useCallback(
    (next: number) => {
      if (!natural) return;
      const safe = clampZoom(next);
      setOffset((current) => offsetForZoom(current, natural, VIEWPORT_PX, zoom, safe));
      setZoom(safe);
    },
    [natural, zoom],
  );

  // Wheel must be a non-passive listener to cancel the page scroll, which React's
  // onWheel cannot do — hence the manual binding.
  useEffect(() => {
    const node = frameRef.current;
    if (!node || !interactive) return;
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      applyZoom(zoom - event.deltaY * WHEEL_ZOOM_FACTOR);
    };
    node.addEventListener("wheel", handleWheel, { passive: false });
    return () => node.removeEventListener("wheel", handleWheel);
  }, [interactive, applyZoom, zoom]);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!interactive) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY };
    dragOriginRef.current = offset;
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !natural) return;
    const origin = dragOriginRef.current;
    setOffset(
      clampOffset(
        {
          x: origin.x + (event.clientX - drag.startX),
          y: origin.y + (event.clientY - drag.startY),
        },
        natural,
        VIEWPORT_PX,
        zoom,
      ),
    );
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!interactive || !natural) return;
    const step = event.shiftKey ? KEYBOARD_STEP_FAST : KEYBOARD_STEP;
    const pan: Record<string, IAvatarOffset> = {
      ArrowLeft: { x: -step, y: 0 },
      ArrowRight: { x: step, y: 0 },
      ArrowUp: { x: 0, y: -step },
      ArrowDown: { x: 0, y: step },
    };
    const delta = pan[event.key];
    if (delta) {
      event.preventDefault();
      setOffset((current) =>
        clampOffset({ x: current.x + delta.x, y: current.y + delta.y }, natural, VIEWPORT_PX, zoom),
      );
      return;
    }
    if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      applyZoom(zoom + KEYBOARD_ZOOM_STEP);
    }
    if (event.key === "-" || event.key === "_") {
      event.preventDefault();
      applyZoom(zoom - KEYBOARD_ZOOM_STEP);
    }
  };

  const handleReset = () => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  };

  const handleConfirm = async () => {
    const image = imageRef.current;
    if (!image || !natural) return;
    setRendering(true);
    try {
      onConfirm(await renderCroppedFile(image, natural, zoom, offset));
    } catch {
      toast.error("Não foi possível recortar a foto. Tente outra imagem.");
    } finally {
      setRendering(false);
    }
  };

  const rendered = natural
    ? renderedSize(natural, VIEWPORT_PX, zoom)
    : { width: VIEWPORT_PX, height: VIEWPORT_PX };

  return (
    <Dialog
      open={file !== null}
      onOpenChange={(open) => {
        if (!open && !busy && !rendering) onCancel();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Ajustar foto</DialogTitle>
          <DialogDescription>
            Arraste a imagem para posicionar e use o zoom para enquadrar. O círculo mostra como ela
            vai aparecer no seu perfil.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4">
          <div
            ref={frameRef}
            role="group"
            tabIndex={interactive ? 0 : -1}
            aria-label="Enquadramento da foto: arraste para posicionar, use as setas para ajustar e + ou - para o zoom"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onKeyDown={handleKeyDown}
            style={{ width: VIEWPORT_PX, height: VIEWPORT_PX }}
            className="relative touch-none select-none overflow-hidden rounded-xl border border-border bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background data-[interactive=true]:cursor-grab data-[interactive=true]:active:cursor-grabbing"
            data-interactive={interactive}
          >
            {status === "ready" && objectUrl && (
              <img
                src={objectUrl}
                alt=""
                draggable={false}
                className="pointer-events-none absolute max-w-none"
                style={{
                  width: `${rendered.width}px`,
                  height: `${rendered.height}px`,
                  left: `${VIEWPORT_PX / 2 + offset.x - rendered.width / 2}px`,
                  top: `${VIEWPORT_PX / 2 + offset.y - rendered.height / 2}px`,
                }}
              />
            )}

            {status === "loading" && (
              <div className="grid size-full place-items-center text-muted-foreground">
                <Icon icon="lucide:loader-circle" className="size-6 animate-spin" />
              </div>
            )}

            {status === "error" && (
              <div className="grid size-full place-items-center px-6 text-center text-sm text-muted-foreground">
                Não foi possível abrir esta imagem. Tente outro arquivo.
              </div>
            )}

            {status === "ready" && (
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 rounded-full border-2 border-dashed border-background shadow-[0_0_0_1px_var(--color-foreground)]"
              />
            )}
          </div>

          <div className="flex w-full items-center gap-3">
            <Icon icon="lucide:zoom-out" className="size-4 shrink-0 text-muted-foreground" />
            <Slider
              value={[zoom]}
              min={AVATAR_MIN_ZOOM}
              max={AVATAR_MAX_ZOOM}
              step={AVATAR_ZOOM_STEP}
              onValueChange={([value]) => applyZoom(value ?? AVATAR_MIN_ZOOM)}
              disabled={!interactive}
              aria-label="Zoom da foto"
              className="flex-1"
            />
            <Icon icon="lucide:zoom-in" className="size-4 shrink-0 text-muted-foreground" />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={handleReset}
              disabled={!interactive}
              aria-label="Centralizar a foto novamente"
              title="Centralizar novamente"
            >
              <Icon icon="lucide:rotate-ccw" className="size-4" />
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onCancel} disabled={busy || rendering}>
            Cancelar
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={!interactive}>
            {busy || rendering ? (
              <>
                <Icon icon="lucide:loader-circle" className="size-4 animate-spin" />
                Enviando…
              </>
            ) : (
              <>
                <Icon icon="lucide:check" className="size-4" />
                Usar esta foto
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
