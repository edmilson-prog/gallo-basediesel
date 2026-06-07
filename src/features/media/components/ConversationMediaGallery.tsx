// src/features/media/components/ConversationMediaGallery.tsx
import type { ID } from "@/shared/types";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useConversationMedia } from "../hooks/useConversationMedia";
import { MediaGallery } from "./MediaGallery";
import { MEDIA_STRINGS } from "../i18n/pt-BR";

interface IConversationMediaGalleryProps {
  conversationId: ID;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Side sheet (scope=conversation) opened by the ConversationHeader "Mídias" button (PRD-011). */
export function ConversationMediaGallery({ conversationId, open, onOpenChange }: IConversationMediaGalleryProps) {
  const media = useConversationMedia(conversationId, open); // only fetch when open
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-hidden p-0 sm:max-w-md">
        <SheetHeader className="sr-only">
          <SheetTitle>{MEDIA_STRINGS.gallery.title}</SheetTitle>
        </SheetHeader>
        <MediaGallery
          scope="conversation"
          assets={media.assets}
          isLoading={media.isLoading}
          isError={media.isError}
          onRetryLoad={media.refetch}
          columns={3}
        />
      </SheetContent>
    </Sheet>
  );
}
