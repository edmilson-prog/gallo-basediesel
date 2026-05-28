import { useState } from "react";
import type { IPart } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { PartImage } from "@/features/catalog";
import { STOREFRONT_PRODUCT_STRINGS as S } from "../i18n/pt-BR";

export interface IProductGalleryProps {
  part: IPart;
}

/**
 * Single-image gallery placeholder with lightbox (PRD-063 RF-008/009/010).
 *
 * MVP renders the category gradient + Iconify glyph used everywhere else for
 * parts without a real image. Structure deliberately holds an `images` array
 * so Fase 2 can wire the carousel + thumbnails without rewriting the page.
 */
export function ProductGallery({ part }: IProductGalleryProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const images: string[] = part.imageUrl ? [part.imageUrl] : [];

  return (
    <div className="space-y-3">
      <button
        type="button"
        className="block w-full overflow-hidden rounded-xl border border-border bg-card transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        onClick={() => setLightboxOpen(true)}
        aria-label={S.galleryAlt(part.name)}
      >
        <div className="aspect-square w-full">
          <PartImage
            part={part}
            size="lg"
            className="!h-full !w-full !rounded-none object-contain"
          />
        </div>
      </button>

      {/* Thumbnails — kept as a single inert thumb on MVP so the layout reads
          as a gallery even with one image. */}
      <div className="flex items-center gap-2">
        <div className="grid h-16 w-16 place-items-center rounded-md border border-primary/50 bg-card">
          <PartImage part={part} size="sm" className="!h-12 !w-12 !rounded-md" />
        </div>
        <p className="text-xs text-muted-foreground">
          Mais imagens, vídeos e visualização 3D chegam na Fase 2.
        </p>
      </div>

      <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
        <DialogContent className="max-w-3xl p-0">
          <div className="relative">
            <Button
              variant="ghost"
              size="icon"
              aria-label={S.galleryLightboxClose}
              className="absolute right-2 top-2 z-10 bg-background/80 hover:bg-background"
              onClick={() => setLightboxOpen(false)}
            >
              <Icon icon="mdi:close" size={18} />
            </Button>
            <div className="grid aspect-square w-full place-items-center bg-muted/30 p-8">
              {images[0] ? (
                <img
                  src={images[0]}
                  alt={part.name}
                  className="max-h-full max-w-full object-contain"
                />
              ) : (
                <PartImage part={part} size="lg" className="!h-64 !w-64 !rounded-xl" />
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
