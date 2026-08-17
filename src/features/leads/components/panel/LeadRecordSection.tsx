import type { ILead } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { formatBRL, formatDateBR } from "@/shared/utils/format";
import { PanelCard, PanelRow } from "@/features/conversations/components/panel/PanelKit";
import { LEADS_STRINGS } from "../../i18n/pt-BR";
import { getConversionReadiness } from "../../engine/conversionReadiness";
import { getNextActionInfo } from "../../utils/leadDisplay";
import { ConversionFieldRow } from "./ConversionFieldRow";

const COPY = LEADS_STRINGS.panel;
const FICHE = LEADS_STRINGS.fiche;

export interface ILeadRecordSectionProps {
  lead: ILead;
  ownerName: string | null;
  canEdit: boolean;
  onSaveField: (changes: Partial<ILead>) => Promise<boolean>;
  pendingField: string | null;
}

/**
 * "Ficha do lead" — the record itself, split in two.
 *
 * The contact block reuses the conversion checklist's rows verbatim, on
 * purpose: the five answers the conversion needs ARE the lead's contact data,
 * and a second editor for the same columns would be a second set of validation
 * rules to keep in step with the first.
 */
export function LeadRecordSection({
  lead,
  ownerName,
  canEdit,
  onSaveField,
  pendingField,
}: ILeadRecordSectionProps) {
  const readiness = getConversionReadiness(lead);
  const nextAction = lead.nextActionAt ? getNextActionInfo(lead.nextActionAt) : null;

  return (
    <>
      <PanelCard icon="mdi:card-account-details-outline" title={COPY.sections.record}>
        {readiness.fields.map((field) => (
          <ConversionFieldRow
            key={field.id}
            field={field}
            lead={lead}
            canEdit={canEdit}
            pending={pendingField === `conversion-${field.id}`}
            onSave={onSaveField}
          />
        ))}
      </PanelCard>

      <PanelCard icon="mdi:clipboard-text-outline" title={FICHE.sectionData}>
        <PanelRow label={FICHE.owner}>
          {ownerName ?? (
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <Icon icon="mdi:account-clock-outline" size={11} aria-hidden />
              {FICHE.ownerQueue}
            </span>
          )}
        </PanelRow>
        <PanelRow label={FICHE.createdAt} muted>
          {formatDateBR(lead.createdAt)}
        </PanelRow>
        {lead.estimatedValue !== undefined && (
          <PanelRow label={FICHE.estimatedValue}>{formatBRL(lead.estimatedValue)}</PanelRow>
        )}
        {nextAction && (
          <PanelRow label={FICHE.nextAction}>
            <span
              className={cn(
                "rounded px-1.5 py-0.5 text-[10px] font-medium",
                nextAction.tone,
              )}
            >
              {nextAction.label}
            </span>
          </PanelRow>
        )}
        {lead.tags.length > 0 && (
          <PanelRow label={FICHE.tags}>
            <span className="flex flex-wrap justify-end gap-1">
              {lead.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
                >
                  {tag}
                </span>
              ))}
            </span>
          </PanelRow>
        )}
      </PanelCard>
    </>
  );
}
