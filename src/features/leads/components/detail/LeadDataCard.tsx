import { useState } from "react";
import type { ILead, ISeller } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { formatBRL, formatDateBR, formatPhone } from "@/shared/utils/format";
import {
  TEMPERATURE_META,
  daysInStage,
  getInitials,
  getNextActionInfo,
  getOriginMeta,
  isConverted,
  isLost,
} from "../../utils/leadDisplay";
import { LEAD_TEMPERATURES } from "../../utils/listFilters";
import {
  addTag,
  normalizeTag,
  type ILeadDraft,
  type ILeadDraftErrors,
} from "../../utils/leadDraft";
import { LEADS_STRINGS } from "../../i18n/pt-BR";

const COPY = LEADS_STRINGS.detail;

export interface ILeadDataCardProps {
  lead: ILead;
  seller?: ISeller;
  editing: boolean;
  draft: ILeadDraft;
  onDraftChange: (patch: Partial<ILeadDraft>) => void;
  errors: ILeadDraftErrors;
}

export function LeadDataCard({
  lead,
  seller,
  editing,
  draft,
  onDraftChange,
  errors,
}: ILeadDataCardProps) {
  const tempMeta = TEMPERATURE_META[lead.temperature];
  const originMeta = getOriginMeta(lead.origin);
  const nextAction = getNextActionInfo(lead.nextActionAt);
  const converted = isConverted(lead);
  const lost = isLost(lead);
  const stageDays = daysInStage(lead);

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h2 className="mb-3 text-sm font-semibold text-foreground">{COPY.data}</h2>

      {/* Status strip */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border pb-3">
        <span
          className="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium"
          style={{ borderColor: lead.stage.color, color: lead.stage.color }}
        >
          {lead.stage.name}
        </span>
        <Badge className={tempMeta.tone} icon={tempMeta.icon}>
          {tempMeta.label}
        </Badge>
        <Badge className={originMeta.tone} icon={originMeta.icon}>
          {originMeta.label}
        </Badge>
        {converted && (
          <Badge
            className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
            icon="mdi:check-decagram"
          >
            {LEADS_STRINGS.card.converted}
          </Badge>
        )}
        {lost && (
          <Badge className="bg-red-500/15 text-red-700 dark:text-red-300" icon="mdi:close-octagon">
            {LEADS_STRINGS.card.lost}
          </Badge>
        )}
      </div>

      {/* Loss reason/notes — read-only, only for lost leads (lost leads aren't editable) */}
      {lost && (lead.lossReason || lead.lossNotes) && (
        <Section title={LEADS_STRINGS.card.lost}>
          {lead.lossReason && (
            <Fact label={COPY.lossReason}>
              <span className="text-red-700 dark:text-red-300">{lead.lossReason}</span>
            </Fact>
          )}
          {lead.lossNotes && <Fact label={COPY.lossNotes}>{lead.lossNotes}</Fact>}
        </Section>
      )}

      {/* Tags block */}
      <div className="border-b border-border py-3">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {COPY.fields.tags}
        </p>
        {editing ? (
          <TagsEditorSlot draft={draft} onDraftChange={onDraftChange} />
        ) : lead.tags.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {lead.tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/60 px-2.5 py-1 text-xs text-foreground"
              >
                <Icon icon="mdi:tag-outline" size={12} className="text-muted-foreground" />
                {tag}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">{COPY.noTags}</p>
        )}
      </div>

      {/* Commercial */}
      <Section title={COPY.groups.commercial}>
        {editing ? (
          <EditCommercialSlot draft={draft} onDraftChange={onDraftChange} errors={errors} />
        ) : (
          <>
            <Fact label={COPY.fields.estimatedValue}>
              {lead.estimatedValue !== undefined ? formatBRL(lead.estimatedValue) : <Dim>—</Dim>}
            </Fact>
            <Fact label={COPY.fields.nextAction}>
              {lead.nextActionAt ? (
                <span
                  className={cn(
                    "inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium",
                    nextAction.tone,
                  )}
                >
                  {nextAction.label}
                </span>
              ) : (
                <Dim>{nextAction.label}</Dim>
              )}
            </Fact>
          </>
        )}
      </Section>

      {/* Contact */}
      <Section title={COPY.groups.contact}>
        <Fact label={COPY.fields.phone}>{formatPhone(lead.phone)}</Fact>
        {editing ? (
          <EditEmailSlot draft={draft} onDraftChange={onDraftChange} errors={errors} />
        ) : (
          <Fact label={COPY.fields.email}>{lead.email ?? <Dim>—</Dim>}</Fact>
        )}
      </Section>

      {/* Management */}
      <Section title={COPY.groups.management} last>
        <Fact label={COPY.seller}>
          {seller ? (
            <span className="inline-flex items-center gap-1.5">
              <span className="grid h-5 w-5 place-items-center rounded-full bg-muted text-[9px] font-semibold text-muted-foreground">
                {getInitials(seller.fullName)}
              </span>
              {seller.fullName}
            </span>
          ) : (
            <Dim>—</Dim>
          )}
        </Fact>
        <Fact label={COPY.createdAt}>{formatDateBR(lead.createdAt)}</Fact>
        <Fact label={COPY.inStageFor}>
          {stageDays} {stageDays === 1 ? "dia" : "dias"}
        </Fact>
      </Section>
    </div>
  );
}

function Badge({
  className,
  icon,
  children,
}: {
  className: string;
  icon: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium",
        className,
      )}
    >
      <Icon icon={icon} size={12} />
      {children}
    </span>
  );
}

function Section({
  title,
  last,
  children,
}: {
  title: string;
  last?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("py-3", !last && "border-b border-border")}>
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">{children}</dl>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-right text-sm font-medium text-foreground">{children}</dd>
    </div>
  );
}

function Dim({ children }: { children: React.ReactNode }) {
  return <span className="font-normal text-muted-foreground">{children}</span>;
}

// --- Edit slots ---

function TagsEditorSlot({
  draft,
  onDraftChange,
}: {
  draft: ILeadDraft;
  onDraftChange: (p: Partial<ILeadDraft>) => void;
}) {
  const [input, setInput] = useState("");
  const commit = () => {
    const next = addTag(draft.tags, input);
    onDraftChange({ tags: next });
    setInput("");
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {draft.tags.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/60 px-2 py-1 text-xs"
        >
          {tag}
          <button
            type="button"
            aria-label={`Remover ${tag}`}
            className="cursor-pointer text-muted-foreground hover:text-foreground"
            onClick={() => onDraftChange({ tags: draft.tags.filter((t) => t !== tag) })}
          >
            <Icon icon="mdi:close" size={12} />
          </button>
        </span>
      ))}
      <Input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            commit();
          }
        }}
        onBlur={() => normalizeTag(input) && commit()}
        placeholder={COPY.addTagPlaceholder}
        aria-label={COPY.addTagPlaceholder}
        className="h-7 w-32 text-xs"
      />
    </div>
  );
}

function EditCommercialSlot({
  draft,
  onDraftChange,
  errors,
}: {
  draft: ILeadDraft;
  onDraftChange: (p: Partial<ILeadDraft>) => void;
  errors: ILeadDraftErrors;
}) {
  return (
    <>
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">{COPY.fields.estimatedValue}</Label>
        <Input
          value={draft.estimatedValue}
          inputMode="decimal"
          onChange={(e) => onDraftChange({ estimatedValue: e.target.value })}
        />
        {errors.estimatedValue && (
          <p className="text-[11px] text-red-600 dark:text-red-400">{errors.estimatedValue}</p>
        )}
      </div>
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">{COPY.fields.nextAction}</Label>
        <Input
          type="date"
          value={draft.nextActionAt}
          onChange={(e) => onDraftChange({ nextActionAt: e.target.value })}
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">{COPY.fields.temperature}</Label>
        <Select
          value={draft.temperature}
          onValueChange={(v) => onDraftChange({ temperature: v as ILeadDraft["temperature"] })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LEAD_TEMPERATURES.map((t) => (
              <SelectItem key={t} value={t}>
                <span className="inline-flex items-center gap-2">
                  <Icon icon={TEMPERATURE_META[t].icon} size={12} />
                  {TEMPERATURE_META[t].label}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </>
  );
}

function EditEmailSlot({
  draft,
  onDraftChange,
  errors,
}: {
  draft: ILeadDraft;
  onDraftChange: (p: Partial<ILeadDraft>) => void;
  errors: ILeadDraftErrors;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{COPY.fields.email}</Label>
      <Input
        value={draft.email}
        inputMode="email"
        onChange={(e) => onDraftChange({ email: e.target.value })}
      />
      {errors.email && <p className="text-[11px] text-red-600 dark:text-red-400">{errors.email}</p>}
    </div>
  );
}
