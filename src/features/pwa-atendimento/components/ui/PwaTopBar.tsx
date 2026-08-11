import { PwaAvatar } from "./PwaAvatar";
import { PWA_ATENDIMENTO_STRINGS as S } from "../../i18n/pt-BR";

interface IPwaTopBarProps {
  title: string;
  subtitle: string;
  online: boolean;
  userInitials: string;
  onAccount: () => void;
}

/** Glass header of the two list screens. */
export function PwaTopBar({
  title,
  subtitle,
  online,
  userInitials,
  onAccount,
}: IPwaTopBarProps) {
  return (
    <div className="flex items-center gap-3 border-b border-border bg-background/95 px-3.5 pb-2.5 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur">
      <div className="min-w-0 flex-1">
        <h1 className="font-display text-2xl font-extrabold uppercase leading-none tracking-[0.02em] text-foreground">
          {title}
        </h1>
        <p className="mt-1 flex items-center gap-1.5 text-[11.5px] font-semibold text-muted-foreground">
          <span
            className={`h-1.5 w-1.5 shrink-0 rounded-full ${
              online ? "bg-severity-success" : "bg-severity-critical"
            }`}
            aria-hidden
          />
          {online ? subtitle : S.list.realtimePaused}
        </p>
      </div>
      <button
        type="button"
        onClick={onAccount}
        aria-label={S.account.open}
        className="flex h-11 w-11 items-center justify-center"
      >
        <PwaAvatar initials={userInitials} size={38} accent />
      </button>
    </div>
  );
}
