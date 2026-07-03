import { useMemo } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useAuth } from "@/features/auth/useAuth";
import { usePermission } from "@/features/rbac/hooks/usePermission";
import { useSellersProvider } from "@/providers/data";
import { useEffect, useState } from "react";
import type { ID, ISeller, IWhatsAppAccount, IConversationTag } from "@/shared/types";
import { accountAccent } from "../utils/instanceAccent";
import { useInboxFiltersCollapsed } from "../hooks/useInboxFiltersCollapsed";
import type { IInboxFiltersState, PeriodFilter, SortMode } from "../hooks/useInboxFilters";
import { serializeAssignmentTokens } from "../hooks/useInboxFilters";
import { assignmentTriggerLabel } from "../utils/assignmentLabel";
import { INBOX_STRINGS } from "../i18n/pt-BR";
import { tagColorHex } from "../engine/tagCatalog";

export interface IInboxFiltersProps {
  state: IInboxFiltersState;
  availableTags: IConversationTag[];
  /** WhatsApp instances of the store — the "Instância" filter only renders with 2+. */
  instances: IWhatsAppAccount[];
  onStatus: (status: IInboxFiltersState["status"]) => void;
  onChannel: (channel: IInboxFiltersState["channel"]) => void;
  onAssignment: (assignment: string[]) => void;
  onInstance: (instance: ID | "all") => void;
  onTags: (tags: string[]) => void;
  onPeriod: (period: PeriodFilter) => void;
  onSort: (sort: SortMode) => void;
  onEscalated: (escalated: boolean) => void;
  onClear: () => void;
  activeCount: number;
}

function TriggerButton({
  label,
  value,
  active,
}: {
  label: string;
  value: string;
  active: boolean;
}) {
  return (
    <Button
      type="button"
      variant={active ? "secondary" : "outline"}
      size="sm"
      className="h-8 gap-1 text-xs"
    >
      <span className="text-muted-foreground">{label}:</span>
      <span className="font-medium">{value}</span>
      <Icon icon="mdi:chevron-down" size={12} className="text-muted-foreground" />
    </Button>
  );
}

function useSellersForAssignment(canSeeAllAssignments: boolean): ISeller[] {
  const sellersProvider = useSellersProvider();
  const [sellers, setSellers] = useState<ISeller[]>([]);
  useEffect(() => {
    if (!canSeeAllAssignments) return;
    let cancelled = false;
    void sellersProvider
      .list({ active: true })
      .then((res) => {
        if (!cancelled) setSellers(res);
      })
      .catch(() => {
        if (!cancelled) setSellers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [sellersProvider, canSeeAllAssignments]);
  return sellers;
}

export function InboxFilters({
  state,
  availableTags,
  instances,
  onStatus,
  onChannel,
  onAssignment,
  onInstance,
  onTags,
  onPeriod,
  onSort,
  onEscalated,
  onClear,
  activeCount,
}: IInboxFiltersProps) {
  const { currentUser } = useAuth();
  const canSeeAllAssignments = usePermission("conversation", "view", "store");
  const sellers = useSellersForAssignment(canSeeAllAssignments);
  const { collapsed, setCollapsed } = useInboxFiltersCollapsed();

  const statusLabel = INBOX_STRINGS.statusOptions[state.status];
  const channelLabel = INBOX_STRINGS.channelOptions[state.channel];
  const periodLabel = INBOX_STRINGS.periodOptions[state.period];
  const sortLabel = INBOX_STRINGS.sortOptions[state.sort];

  const selectedInstance =
    state.instance === "all" ? null : (instances.find((a) => a.id === state.instance) ?? null);
  const instanceValueLabel = selectedInstance?.label ?? INBOX_STRINGS.instanceAllOption;

  const assignmentLabel = useMemo(
    () => assignmentTriggerLabel(state.assignment, sellers, INBOX_STRINGS.assignmentOptions),
    [state.assignment, sellers],
  );

  const currentSellerId = currentUser?.sellerId ?? null;
  const assignmentActive =
    serializeAssignmentTokens(state.assignment, currentSellerId) !== undefined;
  const toggleAssignment = (token: string) => {
    const set = new Set(state.assignment);
    if (set.has(token)) set.delete(token);
    else set.add(token);
    onAssignment(Array.from(set));
  };

  return (
    <Collapsible data-tour="inbox-filters" open={!collapsed} onOpenChange={(open) => setCollapsed(!open)}>
      {/* Trigger row — always visible so the user can re-open and still sees
          how many filters are active while collapsed. */}
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-1.5">
        <CollapsibleTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 px-2 text-xs"
            aria-label={
              collapsed ? INBOX_STRINGS.filtersExpandAria : INBOX_STRINGS.filtersCollapseAria
            }
          >
            <Icon icon="mdi:filter-variant" size={14} className="text-muted-foreground" />
            <span className="font-medium">{INBOX_STRINGS.filtersToggle}</span>
            {activeCount > 0 && (
              <Badge
                variant="secondary"
                className="h-4 min-w-4 justify-center px-1 text-[10px] tabular-nums"
                aria-label={INBOX_STRINGS.filtersActiveCountAria(activeCount)}
              >
                {activeCount}
              </Badge>
            )}
            <Icon
              icon="mdi:chevron-down"
              size={14}
              className={cn(
                "text-muted-foreground transition-transform duration-200",
                !collapsed && "rotate-180",
              )}
            />
          </Button>
        </CollapsibleTrigger>

        {activeCount > 0 && (
          <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={onClear}>
            {INBOX_STRINGS.clearAll}
          </Button>
        )}
      </div>

      <CollapsibleContent className="overflow-hidden data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-top-1 data-[state=closed]:animate-out data-[state=closed]:fade-out-0">
        <div className="flex flex-wrap items-center gap-1.5 border-b border-border px-3 pb-2 pt-1">
          {/* Status */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <span>
                <TriggerButton
                  label={INBOX_STRINGS.statusLabel}
                  value={statusLabel}
                  active={state.status !== "all"}
                />
              </span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuLabel>{INBOX_STRINGS.statusLabel}</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={state.status}
                onValueChange={(v) => onStatus(v as IInboxFiltersState["status"])}
              >
                <DropdownMenuRadioItem value="all">
                  {INBOX_STRINGS.statusOptions.all}
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="aguardando">
                  {INBOX_STRINGS.statusOptions.aguardando}
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="em_andamento">
                  {INBOX_STRINGS.statusOptions.em_andamento}
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="aguardando_cliente">
                  {INBOX_STRINGS.statusOptions.aguardando_cliente}
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="resolvida">
                  {INBOX_STRINGS.statusOptions.resolvida}
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="arquivada">
                  {INBOX_STRINGS.statusOptions.arquivada}
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Channel */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <span>
                <TriggerButton
                  label={INBOX_STRINGS.channelLabel}
                  value={channelLabel}
                  active={state.channel !== "all"}
                />
              </span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              <DropdownMenuRadioGroup
                value={state.channel}
                onValueChange={(v) => onChannel(v as IInboxFiltersState["channel"])}
              >
                <DropdownMenuRadioItem value="all">
                  {INBOX_STRINGS.channelOptions.all}
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="whatsapp">
                  {INBOX_STRINGS.channelOptions.whatsapp}
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="ecommerce">
                  {INBOX_STRINGS.channelOptions.ecommerce}
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="phone">
                  {INBOX_STRINGS.channelOptions.phone}
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="site">
                  {INBOX_STRINGS.channelOptions.site}
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Instance (multi-instância) — only when the store has 2+ numbers. */}
          {instances.length > 1 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <span>
                  <Button
                    type="button"
                    variant={state.instance !== "all" ? "secondary" : "outline"}
                    size="sm"
                    className="h-8 gap-1.5 text-xs"
                  >
                    <span className="text-muted-foreground">{INBOX_STRINGS.instanceLabel}:</span>
                    {selectedInstance && (
                      <span
                        aria-hidden
                        className="size-2 shrink-0 rounded-full"
                        style={{ backgroundColor: accountAccent(selectedInstance) }}
                      />
                    )}
                    <span className="font-medium">{instanceValueLabel}</span>
                    <Icon icon="mdi:chevron-down" size={12} className="text-muted-foreground" />
                  </Button>
                </span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="max-h-80 w-56 overflow-y-auto">
                <DropdownMenuLabel>{INBOX_STRINGS.instanceLabel}</DropdownMenuLabel>
                <DropdownMenuRadioGroup
                  value={state.instance}
                  onValueChange={(v) => onInstance(v as ID | "all")}
                >
                  <DropdownMenuRadioItem value="all">
                    {INBOX_STRINGS.instanceAllOption}
                  </DropdownMenuRadioItem>
                  {instances.map((acc) => (
                    <DropdownMenuRadioItem key={acc.id} value={acc.id} className="gap-2">
                      <span
                        aria-hidden
                        className="size-2 shrink-0 rounded-full"
                        style={{ backgroundColor: accountAccent(acc) }}
                      />
                      <span className="truncate">{acc.label}</span>
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* Assignment — multi-select (OR). Combinable by every user; the
              per-seller list + "Todas" stay staff-only (canSeeAllAssignments). */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <span>
                <TriggerButton
                  label={INBOX_STRINGS.assignmentLabel}
                  value={assignmentLabel}
                  active={assignmentActive}
                />
              </span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-80 w-56 overflow-y-auto">
              {currentUser && (
                <DropdownMenuCheckboxItem
                  checked={state.assignment.includes("me")}
                  onSelect={(e) => e.preventDefault()}
                  onCheckedChange={() => toggleAssignment("me")}
                >
                  {INBOX_STRINGS.assignmentOptions.me}
                </DropdownMenuCheckboxItem>
              )}
              {/* Queue — visible to any inbox user. Non-staff sellers can view
                  and claim pool conversations per RLS, so this filter must not
                  be gated behind store scope. */}
              <DropdownMenuCheckboxItem
                checked={state.assignment.includes("queue")}
                onSelect={(e) => e.preventDefault()}
                onCheckedChange={() => toggleAssignment("queue")}
              >
                {INBOX_STRINGS.assignmentOptions.queue}
              </DropdownMenuCheckboxItem>
              {/* Staff-only: "Todas" (clears the set) + filter by specific sellers. */}
              {canSeeAllAssignments && (
                <>
                  <DropdownMenuCheckboxItem
                    checked={state.assignment.length === 0}
                    onSelect={(e) => e.preventDefault()}
                    onCheckedChange={() => onAssignment([])}
                  >
                    {INBOX_STRINGS.assignmentOptions.all}
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-xs">
                    {INBOX_STRINGS.assignmentOptions.seller}
                  </DropdownMenuLabel>
                  {sellers.map((s) => (
                    <DropdownMenuCheckboxItem
                      key={s.id}
                      checked={state.assignment.includes(s.id)}
                      onSelect={(e) => e.preventDefault()}
                      onCheckedChange={() => toggleAssignment(s.id)}
                    >
                      {s.fullName}
                    </DropdownMenuCheckboxItem>
                  ))}
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Tags (conversation tags — catalog ids; OR semantics) */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <span>
                <TriggerButton
                  label={INBOX_STRINGS.tagsLabel}
                  value={INBOX_STRINGS.tagsCounter(state.tags.length)}
                  active={state.tags.length > 0}
                />
              </span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-80 w-56 overflow-y-auto">
              <DropdownMenuLabel>{INBOX_STRINGS.tagsLabel}</DropdownMenuLabel>
              {availableTags.length === 0 && (
                <p className="px-2 py-1.5 text-xs text-muted-foreground">
                  {INBOX_STRINGS.tagsEmpty}
                </p>
              )}
              {availableTags.map((tag) => {
                const checked = state.tags.includes(tag.id);
                return (
                  <DropdownMenuCheckboxItem
                    key={tag.id}
                    checked={checked}
                    onSelect={(e) => e.preventDefault()}
                    onCheckedChange={(next) => {
                      if (next) onTags([...state.tags, tag.id]);
                      else onTags(state.tags.filter((t) => t !== tag.id));
                    }}
                    className="gap-2"
                  >
                    <span
                      aria-hidden
                      className="size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: tagColorHex(tag.color) }}
                    />
                    <span className="truncate">
                      {tag.label}
                      {tag.archived && (
                        <span className="ml-1 text-muted-foreground">
                          {INBOX_STRINGS.tagsArchivedSuffix}
                        </span>
                      )}
                    </span>
                  </DropdownMenuCheckboxItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Period */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <span>
                <TriggerButton
                  label={INBOX_STRINGS.periodLabel}
                  value={periodLabel}
                  active={state.period !== "all"}
                />
              </span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              <DropdownMenuRadioGroup
                value={state.period}
                onValueChange={(v) => onPeriod(v as PeriodFilter)}
              >
                <DropdownMenuRadioItem value="all">
                  {INBOX_STRINGS.periodOptions.all}
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="24h">
                  {INBOX_STRINGS.periodOptions["24h"]}
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="7d">
                  {INBOX_STRINGS.periodOptions["7d"]}
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="30d">
                  {INBOX_STRINGS.periodOptions["30d"]}
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Sort */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <span>
                <TriggerButton
                  label={INBOX_STRINGS.sortLabel}
                  value={sortLabel}
                  active={state.sort !== "lastMessage"}
                />
              </span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              <DropdownMenuRadioGroup
                value={state.sort}
                onValueChange={(v) => onSort(v as SortMode)}
              >
                <DropdownMenuRadioItem value="lastMessage">
                  {INBOX_STRINGS.sortOptions.lastMessage}
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="waiting">
                  {INBOX_STRINGS.sortOptions.waiting}
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="abc">
                  {INBOX_STRINGS.sortOptions.abc}
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Escalated (PRD-023) */}
          <Button
            type="button"
            variant={state.escalated ? "secondary" : "outline"}
            size="sm"
            className="h-8 gap-1 text-xs"
            onClick={() => onEscalated(!state.escalated)}
            aria-pressed={state.escalated}
          >
            <Icon icon="mdi:robot" size={12} />
            Escaladas pelo SDR
          </Button>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
