// src/features/quick-send/components/library-admin/QuickReplyPreviewBubble.tsx
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { useAuth } from "@/features/auth/useAuth";
import { useCurrentStore } from "@/features/multistore/hooks/useCurrentStore";
import { resolvePlaceholders } from "../../engine/placeholderResolver";
import { buildSampleContext } from "../../engine/placeholderVocabulary";
import { QUICK_SEND_STRINGS } from "../../i18n/pt-BR";

export interface IQuickReplyPreviewBubbleProps {
  body: string;
}

/**
 * Decorative outbound WhatsApp-style bubble for the quick-reply editor live
 * preview. Renders the placeholder-resolved text using a sample context seeded
 * from the current user's name and active store name — values are illustrative
 * (never the real send data).
 *
 * Visual approach mirrors the outbound tone in BubbleChrome (`bg-primary/10`)
 * rather than importing the real message infrastructure (which requires a full
 * IMessage object). Right-aligned; fake time + double-check tick are
 * aria-hidden (decorative).
 */
export function QuickReplyPreviewBubble({ body }: IQuickReplyPreviewBubbleProps) {
  const s = QUICK_SEND_STRINGS.quickReplies;

  // Feed buildSampleContext with real names so the preview is meaningful —
  // fall back to the defaults inside buildSampleContext if unavailable.
  const { currentUser } = useAuth();
  const { currentStore } = useCurrentStore();

  const sampleCtx = buildSampleContext({
    vendedor: currentUser?.displayName ?? undefined,
    loja: currentStore?.name ?? undefined,
  });

  const { resolved } = resolvePlaceholders(body || "", sampleCtx);

  return (
    <div className="space-y-1">
      {/* Label row */}
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {s.previewTitle}
      </p>

      {/* Bubble container — right-aligned like an outbound message */}
      <div className="flex w-full justify-end">
        <div
          className={cn(
            "relative max-w-[78%] rounded-2xl px-3 py-2 text-sm shadow-sm",
            "bg-primary/10 border border-primary/20 text-foreground",
          )}
          role="img"
          aria-label={s.previewTitle}
        >
          {/* Message text */}
          <p className="whitespace-pre-wrap break-words leading-relaxed">
            {resolved || " " /* non-breaking space keeps min height */}
          </p>

          {/* Status row — decorative (fake time + double-check) */}
          <div
            className="mt-1 flex items-center justify-end gap-1 text-[11px] text-muted-foreground"
            aria-hidden="true"
          >
            <span>12:00</span>
            <Icon icon="mdi:check-all" size={13} className="text-primary" />
          </div>
        </div>
      </div>

      {/* Disclaimer note */}
      <p className="text-right text-[10px] text-muted-foreground">
        {s.previewNote}
      </p>
    </div>
  );
}
