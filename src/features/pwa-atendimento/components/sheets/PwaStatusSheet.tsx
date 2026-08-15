import type { ConversationStatus } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { PwaSheet } from "../ui/PwaSheet";
import { PwaStatusDot } from "../ui/PwaStatusPill";
import { PWA_STATUS_META, PWA_STATUS_ORDER } from "../ui/statusMeta";
import { PWA_ATENDIMENTO_STRINGS as S } from "../../i18n/pt-BR";

interface IPwaStatusSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  status: ConversationStatus;
  onPick: (status: ConversationStatus) => void;
}

export function PwaStatusSheet({ open, onOpenChange, status, onPick }: IPwaStatusSheetProps) {
  return (
    <PwaSheet open={open} onOpenChange={onOpenChange} title={S.status.title}>
      <div className="flex flex-col">
        {PWA_STATUS_ORDER.map((option) => {
          const active = option === status;
          return (
            <button
              key={option}
              type="button"
              onClick={() => onPick(option)}
              className={cn(
                "flex min-h-[52px] w-full items-center gap-3 border-b border-border px-3 py-3.5 text-left",
                active && "rounded bg-foreground/[0.05]",
              )}
            >
              <PwaStatusDot status={option} size={9} />
              <span
                className={cn(
                  "flex-1 text-[14.5px] text-foreground",
                  active ? "font-extrabold" : "font-semibold",
                )}
              >
                {PWA_STATUS_META[option].label}
              </span>
              {active && <Icon icon="mdi:check" size={17} className="text-primary" />}
            </button>
          );
        })}
      </div>
      <p className="mx-0.5 mt-3.5 text-[12.5px] leading-relaxed text-muted-foreground">
        {S.status.note}
      </p>
    </PwaSheet>
  );
}
