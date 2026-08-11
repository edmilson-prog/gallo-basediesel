import { Icon } from "@/components/Icon";
import { PwaSheet } from "../ui/PwaSheet";
import { PWA_ATENDIMENTO_STRINGS as S } from "../../i18n/pt-BR";

interface IPwaMoreSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onResolve: () => void;
  onOpenMedia: () => void;
  /** Customer phone in E.164-ish digits; the call row hides without one. */
  phone: string;
}

export function PwaMoreSheet({
  open,
  onOpenChange,
  onResolve,
  onOpenMedia,
  phone,
}: IPwaMoreSheetProps) {
  const rows = [
    { icon: "mdi:check", label: S.moreSheet.resolve, onClick: onResolve },
    { icon: "mdi:image-multiple-outline", label: S.moreSheet.media, onClick: onOpenMedia },
  ];

  return (
    <PwaSheet open={open} onOpenChange={onOpenChange} title={S.moreSheet.title}>
      <div className="flex flex-col">
        {rows.map((row) => (
          <button
            key={row.label}
            type="button"
            onClick={row.onClick}
            className="flex min-h-[56px] w-full items-center gap-3 border-b border-border px-0.5 py-3.5 text-left"
          >
            <Icon icon={row.icon} size={18} className="text-muted-foreground" />
            <span className="text-[14.5px] font-semibold text-foreground">{row.label}</span>
          </button>
        ))}
        {phone && (
          <a
            href={`tel:${phone.replace(/\D/g, "")}`}
            className="flex min-h-[56px] w-full items-center gap-3 border-b border-border px-0.5 py-3.5 text-left"
          >
            <Icon icon="mdi:phone" size={18} className="text-muted-foreground" />
            <span className="text-[14.5px] font-semibold text-foreground">{S.moreSheet.call}</span>
          </a>
        )}
      </div>
    </PwaSheet>
  );
}
