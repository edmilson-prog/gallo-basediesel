import { Link } from "@tanstack/react-router";
import type { ConversationStatus } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { PwaAvatar } from "../ui/PwaAvatar";
import { PwaStatusPill } from "../ui/PwaStatusPill";
import { PWA_ATENDIMENTO_STRINGS as S } from "../../i18n/pt-BR";

interface IPwaThreadHeaderProps {
  name: string;
  initials: string;
  /** Foto de perfil do contato, quando sincronizada. */
  avatarUrl?: string | null;
  /** O nome é só um telefone — o avatar usa ícone genérico. */
  isPhoneName?: boolean;
  status: ConversationStatus;
  conversationId: string;
  onOpenStatus: () => void;
  onOpenMore: () => void;
}

export function PwaThreadHeader({
  name,
  initials,
  avatarUrl,
  isPhoneName,
  status,
  conversationId,
  onOpenStatus,
  onOpenMore,
}: IPwaThreadHeaderProps) {
  return (
    <div className="flex items-center gap-1.5 border-b border-border bg-background/95 py-2 pl-1 pr-2 pt-[max(0.5rem,env(safe-area-inset-top))] backdrop-blur">
      <Link
        to="/atendimento/conversas"
        aria-label={S.thread.back}
        className="flex h-11 w-11 shrink-0 items-center justify-center text-foreground"
      >
        <Icon icon="mdi:chevron-left" size={22} />
      </Link>
      <PwaAvatar initials={initials} src={avatarUrl} isPhoneName={isPhoneName} size={38} />
      <div className="ml-1 min-w-0 flex-1">
        <p className="truncate text-[14.5px] font-extrabold text-foreground">{name}</p>
        <div className="mt-px">
          <PwaStatusPill status={status} onClick={onOpenStatus} />
        </div>
      </div>
      <Link
        to="/atendimento/conversa/$id/midias"
        params={{ id: conversationId }}
        aria-label={S.thread.media}
        className="flex h-11 w-11 shrink-0 items-center justify-center text-muted-foreground"
      >
        <Icon icon="mdi:image-multiple-outline" size={19} />
      </Link>
      <button
        type="button"
        onClick={onOpenMore}
        aria-label={S.thread.more}
        className="flex h-11 w-11 shrink-0 items-center justify-center text-muted-foreground"
      >
        <Icon icon="mdi:dots-vertical" size={19} />
      </button>
    </div>
  );
}
