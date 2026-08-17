import type { ReactNode } from "react";
import type { ILead } from "@/shared/types";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { PanelChip } from "@/features/conversations/components/panel/PanelKit";
import { getInitials, getOriginMeta, isConverted, isLost, TEMPERATURE_META } from "../../utils/leadDisplay";
import type { ILeadFicheIdentity } from "../../utils/leadFiche";
import { LEADS_STRINGS } from "../../i18n/pt-BR";

const COPY = LEADS_STRINGS.panel;

export interface ILeadPanelHeaderProps {
  identity: ILeadFicheIdentity;
  lead: ILead | null;
  /** The kebab menu, supplied by the caller so the header stays presentational. */
  menu?: ReactNode;
}

/**
 * Identity block: who this is, in one line, plus the three facts that change
 * how you talk to them (it is a lead, how warm, where it came from).
 *
 * The phone moved OUT of here and into the conversion checklist, where it is
 * one of the five answers the panel is tracking. Printing it twice made the
 * header taller for no new information.
 */
export function LeadPanelHeader({ identity, lead, menu }: ILeadPanelHeaderProps) {
  const temperature = lead ? TEMPERATURE_META[lead.temperature] : null;
  const origin = lead ? getOriginMeta(lead.origin) : null;
  const converted = lead ? isConverted(lead) : false;
  const lost = lead ? isLost(lead) : false;

  return (
    <header className="flex shrink-0 items-center gap-2.5 px-3 pb-2.5 pt-3">
      <Avatar className="size-9 shrink-0">
        {identity.avatarUrl && <AvatarImage src={identity.avatarUrl} alt="" />}
        <AvatarFallback className="text-[13px] font-extrabold">
          {getInitials(identity.name)}
        </AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1">
        <h2
          className="truncate text-sm font-bold uppercase tracking-[0.01em] text-foreground"
          title={identity.name}
        >
          {identity.name}
        </h2>
        <div className="mt-1 flex flex-wrap items-center gap-1">
          {converted ? (
            <PanelChip tone="success" icon="mdi:check-decagram">
              {LEADS_STRINGS.fiche.stateConverted}
            </PanelChip>
          ) : lost ? (
            <PanelChip tone="critical" icon="mdi:close-octagon-outline">
              {LEADS_STRINGS.fiche.stateLost}
            </PanelChip>
          ) : (
            <PanelChip tone="primary">{COPY.leadChip}</PanelChip>
          )}
          {temperature && lead && (
            <PanelChip tone={TEMPERATURE_TONE[lead.temperature]} icon={temperature.icon}>
              {temperature.label}
            </PanelChip>
          )}
          {origin && <PanelChip variant="outline">{origin.label}</PanelChip>}
        </div>
      </div>

      {menu}
    </header>
  );
}

/** Same three severities `TEMPERATURE_META` already paints with, as panel tones. */
const TEMPERATURE_TONE = {
  frio: "info",
  morno: "warning",
  quente: "critical",
} as const;
