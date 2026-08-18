import { Icon } from "@/components/Icon";
import { Badge } from "@/components/ui/badge";
import { ProfileField } from "./ProfileField";
import { ProfileSectionCard } from "./ProfileSectionCard";

export interface IProfileContactDraft {
  fullName: string;
  email: string;
  phone: string;
  region: string;
}

interface IProfileContactCardProps {
  draft: IProfileContactDraft;
  onChange: (key: keyof IProfileContactDraft, value: string) => void;
  /** Role label shown on the read-only field. */
  roleLabel: string | null;
  /** External sellers/representatives operate on a region. */
  showRegion: boolean;
  emailVerified: boolean | null;
}

/** Editable contact block — the only part of the page that feeds the save bar. */
export function ProfileContactCard({
  draft,
  onChange,
  roleLabel,
  showRegion,
  emailVerified,
}: IProfileContactCardProps) {
  return (
    <ProfileSectionCard
      title="Dados de contato"
      icon="lucide:id-card"
      right={
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Icon icon="lucide:scroll-text" className="size-3.5" />
          Alterações vão para a auditoria
        </span>
      }
    >
      <div className="grid gap-4 py-4 md:grid-cols-2">
        <ProfileField
          label="Nome completo"
          icon="lucide:user-round"
          value={draft.fullName}
          onChange={(v) => onChange("fullName", v)}
          autoComplete="name"
        />
        <ProfileField
          label="Email"
          icon="lucide:mail"
          type="email"
          value={draft.email}
          onChange={(v) => onChange("email", v)}
          autoComplete="email"
          badge={
            emailVerified ? (
              <Badge
                variant="outline"
                className="gap-1 border-severity-success/40 text-severity-success"
              >
                <Icon icon="lucide:check" className="size-3" />
                verificado
              </Badge>
            ) : undefined
          }
          hint="Usado para login e recuperação de senha."
        />
        <ProfileField
          label="Telefone"
          icon="lucide:phone"
          type="tel"
          value={draft.phone}
          placeholder="(55) 99000-0000"
          onChange={(v) => onChange("phone", v)}
          autoComplete="tel"
          hint="WhatsApp do atendimento — aparece nos orçamentos enviados."
        />
        <ProfileField
          label="Papel no sistema"
          icon="lucide:shield"
          value={roleLabel ?? "—"}
          readOnly
          hint="Somente um Owner pode alterar seu papel."
        />
        {showRegion && (
          <ProfileField
            label="Região"
            icon="lucide:map-pin"
            value={draft.region}
            placeholder="Ex.: Médio Alto Uruguai"
            onChange={(v) => onChange("region", v)}
            hint="Área de atuação usada nos relatórios de campo."
          />
        )}
      </div>
    </ProfileSectionCard>
  );
}
