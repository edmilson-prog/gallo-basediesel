import type { ID } from "@/shared/types";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useConversationMessageMedia } from "../../hooks/useConversationMessageMedia";
import { MessageMediaGallery } from "./MessageMediaGallery";

interface IProps {
  conversationId: ID;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Side sheet (scope=conversation) showing the conversation's real media,
 * derived from messages — replaces the Vault gallery here (PR #71 follow-up).
 * The filterable gallery body is shared with the customer fiche tab via
 * {@link MessageMediaGallery}.
 */
export function ConversationMediaPanel({ conversationId, open, onOpenChange }: IProps) {
  const media = useConversationMessageMedia(conversationId, open);
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b border-border px-4 py-3">
          <SheetTitle className="text-sm font-semibold">Mídias</SheetTitle>
        </SheetHeader>
        <MessageMediaGallery {...media} />
      </SheetContent>
    </Sheet>
  );
}
