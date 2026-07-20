import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { IConversation, IConversationContact, ID, ILead } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { formatBRL, formatDateBR, formatPhone } from "@/shared/utils/format";
import { useSellersProvider } from "@/providers/data";
import { usePermission } from "@/features/rbac/hooks/usePermission";
import { useAuth } from "@/features/auth/useAuth";
// Reuses the customer fiche's breakpoint hook as the single source of truth
// (column ≥1280 / drawer 768–1279 / route <768 — identical thresholds).
import { useFicheLayout } from "@/features/customers/hooks/useFicheLayout";
import { ConvertLeadModal } from "./ConvertLeadModal";
import {
  TEMPERATURE_META,
  getInitials,
  getNextActionInfo,
  getOriginMeta,
  isConverted,
  isLost,
} from "../utils/leadDisplay";
import { resolveLeadFicheIdentity } from "../utils/leadFiche";
import { LEADS_STRINGS } from "../i18n/pt-BR";

const COPY = LEADS_STRINGS.fiche;

export interface ILeadProfileFicheProps {
  /** Lead resolved via the conversation-gated RPC — null falls back to `contact`. */
  lead: ILead | null;
  /** Pool-safe contact from `conversation_contacts` — feeds the degraded card. */
  contact: IConversationContact | null;
  /** The anchoring conversation — feeds the direct-read predicate of "Ver lead". */
  conversation: IConversation;
  /** Drawer open state from `useConversationFiche()`. */
  open: boolean;
  /** Drawer close handler. */
  onOpenChange: (open: boolean) => void;
  /** Called after a successful lead→customer conversion (caller refreshes the detail). */
  onConverted?: () => void;
}

/**
 * Read-only lateral fiche for LEAD-anchored conversations — the counterpart of
 * `CustomerProfileFiche` for the post-Funnel-Frente-3 world where most
 * conversations anchor on a lead (customer_id null) and the "Ficha" button
 * used to be a dead click. Same three responsive behaviors (column ≥1280px /
 * drawer 768–1279 / route <768 handled by `useFicheButtonHandler`).
 * Spec: docs/superpowers/specs/2026-07-18-lead-fiche-lateral.md.
 */
export function LeadProfileFiche({
  lead,
  contact,
  conversation,
  open,
  onOpenChange,
  onConverted,
}: ILeadProfileFicheProps) {
  const mode = useFicheLayout();

  // Route mode (<768px) deliberately falls back to the same overlay Sheet as
  // drawer mode — a spec §4 deviation, recorded in the PR: navigating to
  // /app/leads/:id would land the pool attendant on "Lead não encontrado"
  // (the PAGE reads under the per-owner leads RLS; only the fiche is
  // conversation-gated), so the mobile "Ficha" tap opens the sheet instead.
  if (mode === "drawer" || mode === "route") {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full max-w-sm overflow-hidden p-0 sm:max-w-md">
          <SheetHeader className="sr-only">
            <SheetTitle>{COPY.title}</SheetTitle>
          </SheetHeader>
          <LeadProfileBody
            lead={lead}
            contact={contact}
            conversation={conversation}
            onConverted={onConverted}
            className="h-full border-l-0"
          />
        </SheetContent>
      </Sheet>
    );
  }

  // column mode
  return (
    <aside
      className={cn(
        "hidden h-full shrink-0 transition-[width] duration-200 ease-in-out xl:block",
        open ? "w-[360px]" : "w-0 overflow-hidden",
      )}
      aria-hidden={!open}
    >
      {open && (
        <LeadProfileBody
          lead={lead}
          contact={contact}
          conversation={conversation}
          onConverted={onConverted}
          className="h-full"
        />
      )}
    </aside>
  );
}

function LeadProfileBody({
  lead,
  contact,
  conversation,
  onConverted,
  className,
}: {
  lead: ILead | null;
  contact: IConversationContact | null;
  conversation: IConversation;
  onConverted?: () => void;
  className?: string;
}) {
  const navigate = useNavigate();
  const sellersProvider = useSellersProvider();
  const { currentUser } = useAuth();
  const mySellerId: ID | null = currentUser?.sellerId ?? null;
  const canViewLeadStore = usePermission("lead", "view", "store");
  const canViewLeadOwn = usePermission("lead", "view");
  const canEditLeadStore = usePermission("lead", "edit", "store");
  const canEditLeadOwn = usePermission("lead", "edit");
  const [convertOpen, setConvertOpen] = useState(false);

  // The always-mounted ConvertLeadModal pattern needs an explicit reset: if a
  // background detail refetch fails soft and nulls `lead` mid-edit, the modal
  // unmounts — without this, a later successful refetch would reopen it out of
  // nowhere (convertOpen would still be true).
  useEffect(() => {
    if (!lead) setConvertOpen(false);
  }, [lead]);

  // RLS-honest action gating (review round 2). "Ver lead" navigates to
  // /app/leads/:id, which reads under the per-owner leads RLS: staff (store
  // scope), the lead's owner, or the conversation's assignee
  // (seller_handles_lead grants direct reads for ASSIGNED conversations only —
  // the pool variant was reverted for per-row perf in 20260619170000).
  const isLeadOwner = !!lead?.sellerId && lead.sellerId === mySellerId;
  const isAssignee = !!conversation.assignedSellerId && conversation.assignedSellerId === mySellerId;
  const canOpenLeadPage = canViewLeadStore || (canViewLeadOwn && (isLeadOwner || isAssignee));
  // Conversion writes (customers INSERT + leads UPDATE) pass RLS only for
  // staff or the lead's own owner — the gated write-RPC stays a v2 item (spec
  // "Fora de escopo"), so v1 simply never offers a CTA that would 42501.
  const canConvert = canEditLeadStore || (canEditLeadOwn && isLeadOwner);

  const ownerId: ID | null = lead?.sellerId ?? null;
  const ownerQuery = useQuery({
    queryKey: ["lead-fiche-owner", ownerId],
    queryFn: () => sellersProvider.get(ownerId as ID),
    enabled: !!ownerId,
    staleTime: 5 * 60_000,
    retry: false,
  });

  const identity = resolveLeadFicheIdentity(lead, contact);
  if (!identity) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center gap-2 border-l border-border bg-card px-6 text-center text-xs text-muted-foreground",
          className,
        )}
      >
        <Icon icon="mdi:account-question-outline" size={24} aria-hidden />
        {COPY.degradedNotice}
      </div>
    );
  }

  const tempMeta = lead ? TEMPERATURE_META[lead.temperature] : null;
  const originMeta = lead ? getOriginMeta(lead.origin) : null;
  const converted = lead ? isConverted(lead) : false;
  const lost = lead ? isLost(lead) : false;
  const nextAction = lead?.nextActionAt ? getNextActionInfo(lead.nextActionAt) : null;

  return (
    <div className={cn("flex flex-col overflow-hidden border-l border-border bg-card", className)}>
      {/* Identity header */}
      <div className="flex items-center gap-3 border-b border-border px-4 py-4">
        <Avatar className="h-12 w-12">
          {identity.avatarUrl && <AvatarImage src={identity.avatarUrl} alt="" />}
          <AvatarFallback className="text-sm font-semibold">
            {getInitials(identity.name)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-foreground">{identity.name}</h2>
          <p className="text-xs text-muted-foreground">{formatPhone(identity.phone)}</p>
          {identity.email && (
            <p className="truncate text-xs text-muted-foreground">{identity.email}</p>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {identity.degraded && (
          <p className="mb-3 rounded-md bg-muted px-3 py-2 text-[11px] text-muted-foreground">
            <Icon icon="mdi:alert-circle-outline" size={12} className="mr-1 inline" aria-hidden />
            {COPY.degradedNotice}
          </p>
        )}

        {lead && (
          <>
            {/* State badges */}
            <div className="mb-3 flex flex-wrap gap-1.5">
              <span
                className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium"
                style={{ borderColor: lead.stage.color, color: lead.stage.color }}
              >
                {lead.stage.name}
              </span>
              {tempMeta && (
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium",
                    tempMeta.tone,
                  )}
                >
                  <Icon icon={tempMeta.icon} size={11} aria-hidden />
                  {tempMeta.label}
                </span>
              )}
              {originMeta && (
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium",
                    originMeta.tone,
                  )}
                >
                  <Icon icon={originMeta.icon} size={11} aria-hidden />
                  {originMeta.label}
                </span>
              )}
              {converted && (
                <span className="inline-flex items-center gap-1 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-300">
                  <Icon icon="mdi:check-decagram" size={11} aria-hidden />
                  {COPY.stateConverted}
                </span>
              )}
              {lost && (
                <span className="inline-flex items-center gap-1 rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] font-medium text-red-700 dark:text-red-300">
                  <Icon icon="mdi:close-octagon-outline" size={11} aria-hidden />
                  {COPY.stateLost}
                </span>
              )}
            </div>

            {/* Data rows */}
            <dl className="space-y-2 text-xs">
              <FicheRow label={COPY.owner}>
                {ownerId
                  ? (ownerQuery.data?.fullName ?? "—")
                  : (
                      <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                        <Icon icon="mdi:account-clock-outline" size={11} aria-hidden />
                        {COPY.ownerQueue}
                      </span>
                    )}
              </FicheRow>
              <FicheRow label={COPY.createdAt}>{formatDateBR(lead.createdAt)}</FicheRow>
              {lead.estimatedValue !== undefined && (
                <FicheRow label={COPY.estimatedValue}>{formatBRL(lead.estimatedValue)}</FicheRow>
              )}
              {nextAction && (
                <FicheRow label={COPY.nextAction}>
                  <span
                    className={cn(
                      "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium",
                      nextAction.tone,
                    )}
                  >
                    {nextAction.label}
                  </span>
                </FicheRow>
              )}
              {lead.tags.length > 0 && (
                <FicheRow label={COPY.tags}>
                  <span className="flex flex-wrap gap-1">
                    {lead.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                      >
                        {tag}
                      </span>
                    ))}
                  </span>
                </FicheRow>
              )}
            </dl>
          </>
        )}
      </div>

      {/* Actions */}
      {lead && (canOpenLeadPage || (canConvert && !converted)) && (
        <div className="flex flex-col gap-2 border-t border-border px-4 py-3">
          {canOpenLeadPage && (
            <Button
              variant="outline"
              size="sm"
              className="w-full gap-1.5"
              onClick={() => void navigate({ to: "/app/leads/$id", params: { id: lead.id } })}
            >
              <Icon icon="mdi:open-in-new" size={14} aria-hidden />
              {COPY.viewLead}
            </Button>
          )}
          {canConvert && !converted && (
            <Button
              size="sm"
              className="w-full gap-1.5"
              onClick={() => setConvertOpen(true)}
            >
              <Icon icon="mdi:account-convert" size={14} aria-hidden />
              {COPY.convert}
            </Button>
          )}
        </div>
      )}

      {lead && (
        <ConvertLeadModal
          lead={convertOpen ? lead : null}
          onClose={() => setConvertOpen(false)}
          onConverted={() => {
            setConvertOpen(false);
            onConverted?.();
          }}
        />
      )}
    </div>
  );
}

function FicheRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right font-medium text-foreground">{children}</dd>
    </div>
  );
}
