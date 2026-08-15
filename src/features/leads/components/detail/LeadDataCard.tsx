import { useEffect, useRef, useState, type ReactNode } from "react";
import type { ILead, ISeller } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatDateBR, formatPhone } from "@/shared/utils/format";
import { tagColorHex } from "@/features/conversations/engine/tagCatalog";
import { getInitials, isLost } from "../../utils/leadDisplay";
import { matchCatalogTag } from "../../utils/leadTagCatalog";
import { useLeadTagCatalog } from "../../hooks/useLeadTagCatalog";
import { LeadTagPicker } from "./LeadTagPicker";
import { LEADS_STRINGS } from "../../i18n/pt-BR";

const COPY = LEADS_STRINGS.detail;
const DAY_MS = 86_400_000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface ILeadDataCardProps {
  lead: ILead;
  seller?: ISeller;
  canEdit: boolean;
  pendingField: string | null;
  onEmailChange: (email: string | undefined) => void;
  onTagsChange: (tags: string[]) => void;
}

/**
 * The lead's own data, edited where it is read.
 *
 * What this card no longer holds is most of the point: the stage moved to the
 * funnels card (there is one per funnel, not one per lead), the estimated value
 * went with it, the next action became the "Agora" block, and temperature,
 * origin and creation date live on the header's state rule. What is left is
 * identity — and it is editable in place, so the page-wide "Editar" mode and
 * its save bar are gone.
 *
 * An empty field stops being a dash and becomes an invitation. A dash says "há
 * um campo aqui e ele está vazio"; "+ adicionar e-mail" says what to do about
 * it, which is the only reason to render the row at all.
 */
export function LeadDataCard({
  lead,
  seller,
  canEdit,
  pendingField,
  onEmailChange,
  onTagsChange,
}: ILeadDataCardProps) {
  const tagCatalog = useLeadTagCatalog(lead.storeId);
  const lost = isLost(lead);
  const ageDays = Math.max(
    0,
    Math.floor((Date.now() - new Date(lead.createdAt).getTime()) / DAY_MS),
  );

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card">
      <header className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <Icon icon="mdi:card-account-details-outline" size={14} className="text-muted-foreground" aria-hidden />
        <h2 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {COPY.data}
        </h2>
        {canEdit && (
          <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-muted-foreground/70">
            <Icon icon="mdi:pencil-outline" size={11} aria-hidden />
            {COPY.inline.hint}
          </span>
        )}
      </header>

      <div className="grid gap-x-6 gap-y-4 px-4 py-4 sm:grid-cols-2">
        <Fact label={COPY.fields.phone}>
          <span className="tabular-nums">{formatPhone(lead.phone)}</span>
        </Fact>

        <InlineText
          label={COPY.fields.email}
          value={lead.email}
          empty={COPY.inline.addEmail}
          type="email"
          canEdit={canEdit}
          pending={pendingField === "email"}
          validate={(v) => (EMAIL_RE.test(v) ? null : LEADS_STRINGS.fiche.invalidEmail)}
          onSave={onEmailChange}
        />

        <Fact label={COPY.seller}>
          {seller ? (
            <span className="inline-flex items-center gap-1.5">
              <span className="grid size-5 shrink-0 place-items-center rounded-full bg-muted text-[9px] font-semibold text-muted-foreground">
                {getInitials(seller.fullName)}
              </span>
              {seller.fullName}
            </span>
          ) : (
            <span className="text-muted-foreground">{COPY.state.sellerQueue}</span>
          )}
        </Fact>

        <Fact label={COPY.inline.leadAge}>
          {COPY.inline.leadAgeValue(ageDays)}
          <span className="ml-1 text-xs font-normal text-muted-foreground">
            {COPY.inline.since(formatDateBR(lead.createdAt))}
          </span>
        </Fact>
      </div>

      {lost && (lead.lossReason || lead.lossNotes) && (
        <div className="grid gap-x-6 gap-y-4 border-t border-border px-4 py-4 sm:grid-cols-2">
          {lead.lossReason && (
            <Fact label={COPY.lossReason}>
              <span className="text-severity-critical">{lead.lossReason}</span>
            </Fact>
          )}
          {lead.lossNotes && <Fact label={COPY.lossNotes}>{lead.lossNotes}</Fact>}
        </div>
      )}

      <div className="border-t border-border px-4 py-3">
        <p className="mb-2 text-[11px] text-muted-foreground">{COPY.fields.tags}</p>
        {canEdit ? (
          <LeadTagPicker selected={lead.tags} catalog={tagCatalog} onChange={onTagsChange} />
        ) : lead.tags.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {lead.tags.map((tag) => {
              const match = matchCatalogTag(tag, tagCatalog);
              return (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/60 px-2.5 py-1 text-xs text-foreground"
                >
                  {match ? (
                    <span
                      aria-hidden
                      className="inline-block size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: tagColorHex(match.color) }}
                    />
                  ) : (
                    <Icon icon="mdi:tag-outline" size={12} className="text-muted-foreground" />
                  )}
                  {tag}
                </span>
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">{COPY.noTags}</p>
        )}
      </div>
    </section>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className="truncate text-sm font-medium text-foreground">{children}</span>
    </div>
  );
}

interface IInlineTextProps {
  label: string;
  value: string | undefined;
  empty: string;
  type?: "text" | "email";
  canEdit: boolean;
  pending: boolean;
  /** Returns an error message, or null when the value is acceptable. */
  validate?: (value: string) => string | null;
  onSave: (value: string | undefined) => void;
}

/** A value that becomes an input where it stands, and an invitation when empty. */
function InlineText({
  label,
  value,
  empty,
  type = "text",
  canEdit,
  pending,
  validate,
  onSave,
}: IInlineTextProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) ref.current?.focus();
  }, [editing]);

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed && validate) {
      const message = validate(trimmed);
      if (message) {
        setError(message);
        // Stays in edit mode: blurring away from an invalid value and having it
        // silently vanish is worse than being held there with the reason.
        ref.current?.focus();
        return;
      }
    }
    setError(null);
    setEditing(false);
    const next = trimmed || undefined;
    if (next !== value) onSave(next);
  };

  if (!canEdit) {
    return (
      <Fact label={label}>
        {value ?? <span className="font-normal text-muted-foreground">—</span>}
      </Fact>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      {editing ? (
        <>
          <Input
            ref={ref}
            type={type}
            value={draft}
            aria-label={label}
            aria-invalid={error ? true : undefined}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              if (e.key === "Escape") {
                setDraft(value ?? "");
                setError(null);
                setEditing(false);
              }
            }}
            className={cn("h-8 text-sm", error && "border-severity-critical")}
          />
          {error && <span className="text-[11px] text-severity-critical">{error}</span>}
        </>
      ) : (
        <button
          type="button"
          disabled={pending}
          aria-label={COPY.inline.edit(label)}
          onClick={() => {
            setDraft(value ?? "");
            setEditing(true);
          }}
          className="group -mx-1.5 inline-flex min-w-0 items-center gap-1.5 rounded px-1.5 py-0.5 text-left transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {value ? (
            <>
              <span className="truncate text-sm font-medium text-foreground">{value}</span>
              <Icon
                icon="mdi:pencil-outline"
                size={11}
                aria-hidden
                className="shrink-0 text-muted-foreground opacity-0 transition group-hover:opacity-100"
              />
            </>
          ) : (
            <span className="inline-flex items-center gap-1 text-sm text-muted-foreground transition group-hover:text-primary">
              <Icon icon="mdi:plus" size={12} aria-hidden />
              {empty}
            </span>
          )}
          {pending && (
            <Icon icon="svg-spinners:ring-resize" size={12} aria-hidden className="shrink-0" />
          )}
        </button>
      )}
    </div>
  );
}
