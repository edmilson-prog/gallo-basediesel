import { Icon } from "@/components/Icon";
import { PwaButton } from "./ui/PwaButton";
import { PWA_ATENDIMENTO_STRINGS as S } from "../i18n/pt-BR";

interface IPwaPushPromptProps {
  open: boolean;
  onAllow: () => void;
  onLater: () => void;
}

/**
 * Soft ask, shown once the list has loaded — never on first paint.
 *
 * It exists so the browser's own dialog is only reached by someone who already
 * said yes here: a "Block" at the system level is permanent from our side, so
 * the cheap refusal has to come first.
 */
export function PwaPushPrompt({ open, onAllow, onLater }: IPwaPushPromptProps) {
  if (!open) return null;
  return (
    <div className="absolute inset-0 z-50 flex flex-col justify-end bg-background/70">
      <div className="rounded-t-[10px] border-t border-border bg-popover px-4 pb-[max(1.125rem,env(safe-area-inset-bottom))] pt-5">
        <span className="flex h-[46px] w-[46px] items-center justify-center rounded-md bg-primary/15 ring-1 ring-inset ring-primary/30">
          <Icon icon="mdi:bell-outline" size={22} className="text-primary" />
        </span>
        <h2 className="mt-4 font-display text-2xl font-extrabold uppercase leading-none tracking-[0.02em] text-foreground">
          {S.push.promptTitle[0]}
          <br />
          {S.push.promptTitle[1]}
        </h2>
        <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">{S.push.promptBody}</p>
        <div className="mt-4 flex flex-col gap-2">
          <PwaButton variant="gold" full onClick={onAllow}>
            {S.push.allow}
          </PwaButton>
          <PwaButton variant="plain" full onClick={onLater}>
            {S.push.later}
          </PwaButton>
        </div>
      </div>
    </div>
  );
}
