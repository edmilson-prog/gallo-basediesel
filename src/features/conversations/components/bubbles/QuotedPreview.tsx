import type { IMessageReplyRef } from "@/shared/types";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/Icon";
import { quotedAuthorLabel, quotedMediaLabel } from "../../engine/replyRef";

export interface IQuotedPreviewProps {
  reply: IMessageReplyRef;
  /** Nome do contato da conversa — autor da citação quando ela é do cliente. */
  contactName?: string;
  /** `bubble` dentro da mensagem; `composer` acima do campo de texto. */
  variant?: "bubble" | "composer";
  /** Leva até a mensagem original. Ausente = citação não clicável (órfã). */
  onJump?: () => void;
}

/**
 * O bloco de citação — mesmo componente dentro da bolha e no composer.
 *
 * Renderiza a partir do SNAPSHOT gravado em `messages.reply_to`, sem consultar
 * a mensagem original: é isso que mantém a thread sem query extra e faz a
 * citação sobreviver quando a original não está no nosso histórico.
 */
export function QuotedPreview({
  reply,
  contactName,
  variant = "bubble",
  onJump,
}: IQuotedPreviewProps) {
  const author = quotedAuthorLabel(reply, contactName);
  const mediaLabel = quotedMediaLabel(reply);
  const clickable = Boolean(onJump);

  const content = (
    <>
      <span className="block truncate text-[11px] font-semibold text-foreground">{author}</span>
      {mediaLabel ? (
        <span className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
          <Icon icon={mediaLabel.icon} size={12} />
          {mediaLabel.label}
        </span>
      ) : (
        <span className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted-foreground">
          {reply.text}
        </span>
      )}
    </>
  );

  const className = cn(
    "block w-full rounded-md border-l-2 border-primary bg-muted/60 px-2 py-1 text-left",
    variant === "bubble" && "mb-1.5",
    clickable && "transition-colors hover:bg-muted",
  );

  if (!clickable) {
    return <div className={className}>{content}</div>;
  }

  return (
    <button type="button" onClick={onJump} className={className}>
      {content}
    </button>
  );
}
