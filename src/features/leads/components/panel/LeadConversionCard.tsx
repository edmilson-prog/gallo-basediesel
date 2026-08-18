import type { ILead } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { LEADS_STRINGS } from "../../i18n/pt-BR";
import { getConversionReadiness, isPersonalLead } from "../../engine/conversionReadiness";
import { ConversionFieldRow } from "./ConversionFieldRow";
import { PanelCard, PanelDivider, PanelRing } from "@/features/conversations/components/panel/PanelKit";

const COPY = LEADS_STRINGS.panel.conversion;

export interface ILeadConversionCardProps {
  lead: ILead;
  /** Whoever can convert can also fill the fields — same RLS composition. */
  canConvert: boolean;
  /** Opens the conversion modal. `link` skips the checklist by design. */
  onConvert: (mode: "new" | "link") => void;
  onSaveField: (changes: Partial<ILead>) => Promise<boolean>;
  /** Which field is being written, so only that row spins. */
  pendingField: string | null;
  /**
   * False when this seller cannot read the lead OUTSIDE the conversation gate.
   * "Só orçamento" navigates to a screen with no conversation, where the lead
   * is read under the ordinary leads RLS — offering the shortcut to somebody it
   * would 406 for is worse than not offering it.
   */
  canQuote: boolean;
  onOnlyQuote: () => void;
  onTogglePersonal: () => void;
}

/**
 * The panel's argument, in one card: what converting this lead needs, how far
 * along it is, and the button that does it.
 *
 * Faithful to the kit on the point that matters — the button is genuinely
 * blocked while a required field is missing, rather than opening a modal that
 * would refuse the same data a second later. What the kit could not show, and
 * this must, is the escape hatch: "vincular a cliente existente" needs none of
 * these fields (it attaches the lead to a customer that already has them), so
 * it stays reachable regardless.
 */
export function LeadConversionCard({
  lead,
  canConvert,
  onConvert,
  onSaveField,
  pendingField,
  canQuote,
  onOnlyQuote,
  onTogglePersonal,
}: ILeadConversionCardProps) {
  if (isPersonalLead(lead)) {
    return (
      <PanelCard tone="muted">
        <div className="flex items-center gap-2">
          <Icon icon="mdi:account-outline" size={14} className="shrink-0 text-muted-foreground" />
          <p className="min-w-0 flex-1 text-[11.5px] text-muted-foreground">
            {COPY.personalBanner}
          </p>
          <Button variant="ghost" size="sm" className="h-7 shrink-0" onClick={onTogglePersonal}>
            {LEADS_STRINGS.panel.conversion.personalUndo}
          </Button>
        </div>
      </PanelCard>
    );
  }

  const readiness = getConversionReadiness(lead);
  const tone = readiness.ready ? "success" : "primary";

  return (
    <PanelCard tone={tone} icon="mdi:account-check-outline" title={COPY.title}>
      <div className="mb-2 flex items-center gap-3">
        <PanelRing percent={readiness.percent} tone={tone}>
          {readiness.filledCount}/{readiness.total}
        </PanelRing>
        <div className="min-w-0 flex-1">
          <p className="text-[12.5px] font-bold leading-tight text-foreground">
            {readiness.ready
              ? COPY.readyTitle
              : COPY.missingTitle(readiness.missingRequired.length)}
          </p>
          <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
            {readiness.ready ? COPY.readyBody : COPY.missingBody}
          </p>
        </div>
      </div>

      <PanelDivider className="mb-1" />

      {readiness.fields.map((field) => (
        <ConversionFieldRow
          key={field.id}
          field={field}
          lead={lead}
          canEdit={canConvert}
          pending={pendingField === `conversion-${field.id}`}
          onSave={onSaveField}
        />
      ))}

      {canConvert && (
        <>
          <ConvertButton ready={readiness.ready} onConvert={() => onConvert("new")} />
          <button
            type="button"
            onClick={() => onConvert("link")}
            className="mt-2 flex w-full items-center justify-center gap-1 rounded text-[11px] font-semibold text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Icon icon="mdi:link-variant" size={12} />
            {COPY.linkExisting}
          </button>
        </>
      )}

      <div className="mt-2.5 flex justify-center gap-3">
        {canQuote && (
          <ShortcutButton
            icon="mdi:file-document-outline"
            label={COPY.onlyQuote}
            title={COPY.onlyQuoteHint}
            onClick={onOnlyQuote}
          />
        )}
        <ShortcutButton
          icon="mdi:account-outline"
          label={COPY.personal}
          title={COPY.personalHint}
          onClick={onTogglePersonal}
        />
      </div>
    </PanelCard>
  );
}

/**
 * Blocked means blocked. A `disabled` button drops pointer events and would
 * take its own tooltip down with it, so the reason is carried on a wrapper that
 * still receives them — otherwise the seller gets a dead button and no answer.
 */
function ConvertButton({ ready, onConvert }: { ready: boolean; onConvert: () => void }) {
  const button = (
    <Button
      size="sm"
      disabled={!ready}
      onClick={onConvert}
      className="mt-2.5 w-full gap-1.5 disabled:opacity-55"
    >
      <Icon icon="mdi:account-check-outline" size={14} />
      {COPY.convert}
    </Button>
  );
  if (ready) return button;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="mt-0 block cursor-not-allowed">{button}</span>
      </TooltipTrigger>
      <TooltipContent side="top">{COPY.blockedHint}</TooltipContent>
    </Tooltip>
  );
}

function ShortcutButton({
  icon,
  label,
  title,
  onClick,
}: {
  icon: string;
  label: string;
  title: string;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-bold text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Icon icon={icon} size={12} />
          {label}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{title}</TooltipContent>
    </Tooltip>
  );
}
