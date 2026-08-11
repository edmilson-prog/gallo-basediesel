import { useNavigate } from "@tanstack/react-router";
import { Icon } from "@/components/Icon";
import { useAuth } from "@/features/auth/useAuth";
import { PwaAvatar } from "../ui/PwaAvatar";
import { PwaButton } from "../ui/PwaButton";
import { PwaSheet } from "../ui/PwaSheet";
import { usePwaNotifications } from "../PwaNotificationsProvider";
import { useInstallPrompt } from "../../hooks/useInstallPrompt";
import { PWA_ATENDIMENTO_STRINGS as S } from "../../i18n/pt-BR";

function Row({
  icon,
  label,
  value,
  onClick,
}: {
  icon: string;
  label: string;
  value: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className="flex min-h-[56px] w-full items-center gap-3 border-b border-border py-3.5 text-left disabled:cursor-default"
    >
      <Icon icon={icon} size={17} className="text-muted-foreground" />
      <span className="flex-1 text-sm font-semibold text-foreground">{label}</span>
      <span className="text-[13px] text-muted-foreground">{value}</span>
      {onClick && <Icon icon="mdi:chevron-right" size={16} className="text-muted-foreground" />}
    </button>
  );
}

interface IPwaAccountSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  online: boolean;
}

/** Account sheet behind the header avatar — identity, state and sign-out. */
export function PwaAccountSheet({ open, onOpenChange, online }: IPwaAccountSheetProps) {
  const navigate = useNavigate();
  const { currentUser, signOut } = useAuth();
  const notifications = usePwaNotifications();
  const { isInstalled, canPrompt, prompt } = useInstallPrompt();
  const permission = notifications.permission;

  const permissionLabel =
    permission === "granted"
      ? S.account.notificationsAllowed
      : permission === "denied"
        ? S.account.notificationsBlocked
        : S.account.notificationsPending;

  return (
    <PwaSheet
      open={open}
      onOpenChange={onOpenChange}
      title={S.account.title}
      footer={
        <PwaButton
          variant="danger"
          full
          onClick={() => {
            onOpenChange(false);
            signOut();
            void navigate({ to: "/atendimento/entrar" });
          }}
        >
          <Icon icon="mdi:logout" size={16} />
          {S.account.logout}
        </PwaButton>
      }
    >
      <div className="flex items-center gap-3 pb-4 pt-0.5">
        <PwaAvatar initials={currentUser?.avatarInitials ?? "?"} size={48} accent />
        <div className="min-w-0">
          <p className="truncate text-[15.5px] font-extrabold text-foreground">
            {currentUser?.displayName ?? "—"}
          </p>
          <p className="mt-0.5 truncate text-[12.5px] text-muted-foreground">
            {[currentUser?.role, currentUser?.storeLabel].filter(Boolean).join(" · ")}
          </p>
        </div>
      </div>

      <Row
        icon="mdi:sync"
        label={S.account.realtime}
        value={online ? S.account.realtimeActive : S.account.realtimePaused}
      />
      <Row
        icon="mdi:bell-outline"
        label={S.account.notifications}
        value={permissionLabel}
        onClick={() => {
          onOpenChange(false);
          notifications.openPreferences();
        }}
      />
      {/* An already-signed-in user is redirected straight to the list and never
          passes the install screen, so this is the only place they can install
          from. Chromium gets the native dialog; iOS has no such API, so it gets
          the screen with the manual "add to home screen" steps. */}
      <Row
        icon="mdi:cellphone"
        label={S.account.installed}
        value={isInstalled ? S.account.yes : S.account.no}
        onClick={
          isInstalled
            ? undefined
            : canPrompt
              ? () => void prompt()
              : () => {
                  onOpenChange(false);
                  void navigate({ to: "/atendimento/instalar" });
                }
        }
      />
    </PwaSheet>
  );
}
