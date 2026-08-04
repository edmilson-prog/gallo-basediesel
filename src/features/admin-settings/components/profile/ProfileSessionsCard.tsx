import { Icon } from "@/components/Icon";
import { Badge } from "@/components/ui/badge";
import { describeDevice } from "../../engine/deviceLabel";
import { ProfileSectionCard } from "./ProfileSectionCard";
import { ProfileSettingRow } from "./ProfileSettingRow";

interface IProfileSessionsCardProps {
  /** Pre-formatted "hoje, 08:42" for the current session's sign-in. */
  signedInAt: string | null;
}

/**
 * Active sessions. Only the CURRENT device can be described client-side —
 * enumerating (and revoking) the other sessions requires a privileged read of
 * `auth.sessions`, which does not exist yet, so the card says so plainly
 * instead of showing controls that would do nothing.
 */
export function ProfileSessionsCard({ signedInAt }: IProfileSessionsCardProps) {
  const device = describeDevice(typeof navigator === "undefined" ? "" : navigator.userAgent);

  return (
    <ProfileSectionCard
      title="Sessões ativas"
      icon="lucide:monitor-smartphone"
      iconClassName="text-severity-info"
      right={<Badge variant="outline">Em breve</Badge>}
    >
      <ProfileSettingRow
        icon={device.icon}
        tone="success"
        title={device.label}
        description={signedInAt ? `Conectado ${signedInAt}` : "Sessão em uso agora"}
        right={
          <Badge
            variant="outline"
            className="gap-1 border-severity-success/40 text-severity-success"
          >
            <Icon icon="lucide:circle-check" className="size-3" />
            Este dispositivo
          </Badge>
        }
      />
      <ProfileSettingRow
        icon="lucide:list"
        tone="muted"
        title="Outros dispositivos"
        description="A lista completa de sessões, com encerramento individual, chega em uma próxima atualização. Por enquanto use “Sair de todos os dispositivos”."
        last
      />
    </ProfileSectionCard>
  );
}
