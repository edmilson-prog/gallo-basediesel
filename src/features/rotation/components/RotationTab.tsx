import { Switch } from "@/components/ui/switch";
import { Icon } from "@/components/Icon";
import type { ISeller } from "@/shared/types";
import { isSellerEligible } from "../engine/eligibility";

const SKIP_TEXT: Record<string, string> = {
  skipped_disabled: "Fora do rodízio (participação desligada).",
  skipped_offline: "Pulado agora — está offline.",
  skipped_inactive: "Pulado — usuário inativo.",
  skipped_off_hours: "Pulado agora — fora do horário de atendimento.",
};

interface IRotationTabProps {
  seller: ISeller;
  enabled: boolean;
  onEnabledChange: (next: boolean) => void;
}

/** Quick participation toggle + live eligibility hint (PRD-213 RF-019/020). */
export function RotationTab({ seller, enabled, onEnabledChange }: IRotationTabProps) {
  const status = isSellerEligible(seller, { enabled }, new Date());
  return (
    <div className="space-y-4">
      <label className="flex items-start justify-between gap-4 rounded-md border border-border bg-card px-4 py-3">
        <span>
          <span className="block text-sm font-medium text-foreground">Participa do rodízio</span>
          <span className="block text-xs text-muted-foreground">
            Quando ligado, este usuário entra na fila de atendimento da loja. A ordem é definida na
            tela do rodízio.
          </span>
        </span>
        <Switch
          checked={enabled}
          onCheckedChange={onEnabledChange}
          aria-label="Participa do rodízio"
        />
      </label>

      <div
        className="flex items-start gap-2 rounded-md border border-dashed border-border bg-muted/30 px-3 py-2.5 text-xs"
        role="status"
      >
        <Icon
          icon={status.eligible ? "mdi:check-circle-outline" : "mdi:information-outline"}
          size={16}
          className={
            status.eligible ? "mt-0.5 text-severity-success" : "mt-0.5 text-muted-foreground"
          }
        />
        <span className="text-muted-foreground">
          {status.eligible
            ? "Elegível agora — receberia atendimentos pelo rodízio."
            : (SKIP_TEXT[status.reason] ?? "Fora do rodízio no momento.")}
        </span>
      </div>

      <p className="text-xs text-muted-foreground">
        A alteração é salva junto com o botão <span className="font-medium">Salvar alterações</span>.
      </p>
    </div>
  );
}
