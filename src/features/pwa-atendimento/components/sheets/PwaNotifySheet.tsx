import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { PwaSheet } from "../ui/PwaSheet";
import { PwaSwitch } from "../ui/PwaSwitch";
import type { IPwaNotifyPrefs } from "../../hooks/useNotificationPrefs";
import { PWA_ATENDIMENTO_STRINGS as S } from "../../i18n/pt-BR";

interface IPwaNotifySheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  permission: NotificationPermission;
  isSupported: boolean;
  prefs: IPwaNotifyPrefs;
  onChange: <K extends keyof IPwaNotifyPrefs>(key: K, value: IPwaNotifyPrefs[K]) => void;
  onRequestPermission: () => void;
}

function GroupLabel({ children }: { children: string }) {
  return (
    <span className="block px-0 pb-0.5 pt-4 text-[10.5px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
      {children}
    </span>
  );
}

export function PwaNotifySheet({
  open,
  onOpenChange,
  permission,
  isSupported,
  prefs,
  onChange,
  onRequestPermission,
}: IPwaNotifySheetProps) {
  const granted = permission === "granted";
  const denied = permission === "denied";

  return (
    <PwaSheet open={open} onOpenChange={onOpenChange} title={S.push.sheetTitle}>
      <div
        className={cn(
          "mb-1.5 flex items-center gap-3 rounded px-3 py-3 ring-1 ring-inset",
          granted
            ? "bg-severity-success/10 ring-severity-success/30"
            : "bg-primary/10 ring-primary/30",
        )}
      >
        <Icon
          icon={granted ? "mdi:bell" : "mdi:bell-off-outline"}
          size={17}
          className={granted ? "text-severity-success" : "text-primary"}
        />
        <span className="min-w-0 flex-1 text-[13px] font-semibold text-foreground">
          {granted ? S.push.stateGranted : denied ? S.push.stateBlocked : S.push.stateDefault}
        </span>
        {!granted && !denied && isSupported && (
          <button
            type="button"
            onClick={onRequestPermission}
            className="min-h-[44px] px-0.5 text-[12.5px] font-bold text-primary"
          >
            {S.push.allowAction}
          </button>
        )}
      </div>

      {denied && (
        <p className="mb-1 text-[12.5px] leading-relaxed text-muted-foreground">
          {S.push.blockedHint}
        </p>
      )}

      <GroupLabel>{S.push.groupPush}</GroupLabel>
      <PwaSwitch
        on={prefs.push}
        onChange={(value) => onChange("push", value)}
        label={S.push.prefNewMessages}
        hint={S.push.prefNewMessagesHint}
        disabled={!granted}
      />
      <PwaSwitch
        on={prefs.waiting}
        onChange={(value) => onChange("waiting", value)}
        label={S.push.prefWaiting}
        hint={S.push.prefWaitingHint}
        disabled={!granted}
      />

      <GroupLabel>{S.push.groupInApp}</GroupLabel>
      <PwaSwitch
        on={prefs.inApp}
        onChange={(value) => onChange("inApp", value)}
        label={S.push.prefInApp}
        hint={S.push.prefInAppHint}
      />
      <PwaSwitch
        on={prefs.sound}
        onChange={(value) => onChange("sound", value)}
        label={S.push.prefSound}
      />
      <PwaSwitch
        on={prefs.quiet}
        onChange={(value) => onChange("quiet", value)}
        label={S.push.prefQuiet}
        hint={S.push.prefQuietHint}
      />
    </PwaSheet>
  );
}
