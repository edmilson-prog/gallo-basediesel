import type { IConversation, IPart, IWhatsAppAccount } from "@/shared/types";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSendProductCard } from "@/features/quick-send";
import { buildPartInsertText } from "../../engine/partInsertText";
import { copyCode, copyFullSheet, copyValue } from "../../engine/partCopy";
import { PART_LOOKUP_STRINGS as S } from "../../i18n/pt-BR";

export interface IPartDetailActionsProps {
  part: IPart;
  conversation: IConversation;
  whatsappAccount: IWhatsAppAccount | null;
  onInsertText: (text: string) => void;
}

async function copyToClipboard(text: string, done: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(done);
  } catch {
    toast.error("Não foi possível copiar.");
  }
}

export function PartDetailActions({
  part,
  conversation,
  whatsappAccount,
  onInsertText,
}: IPartDetailActionsProps) {
  const { sendProductCard } = useSendProductCard(conversation, whatsappAccount);

  return (
    <div className="flex items-center gap-2 border-t border-border bg-card/60 p-2.5">
      <Button
        variant="secondary"
        size="sm"
        className="flex-1 gap-1.5"
        onClick={() => onInsertText(buildPartInsertText(part))}
      >
        <Icon icon="mdi:plus" size={14} />
        {S.insert}
      </Button>
      <Button size="sm" className="flex-1 gap-1.5" onClick={() => void sendProductCard(part)}>
        <Icon icon="mdi:send" size={14} />
        {S.send}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" className="h-8 w-8" aria-label={S.more}>
            <Icon icon="mdi:dots-horizontal" size={16} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => void copyToClipboard(copyValue(part), "Valor copiado")}>
            {S.copyValue}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void copyToClipboard(copyCode(part), "Código copiado")}>
            {S.copyCode}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => void copyToClipboard(copyFullSheet(part), "Ficha copiada")}
          >
            {S.copySheet}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
