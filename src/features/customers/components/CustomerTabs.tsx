import { useState } from "react";
import type { ICustomer } from "@/shared/types";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { ScrollProgressBar } from "@/features/shell/components/ScrollProgressBar";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { CustomerMediaTab } from "@/features/conversations/components/media/CustomerMediaTab";
import { AttendanceHistoryPanel } from "@/features/attendance-history";
import { CUSTOMER_STRINGS } from "../i18n/pt-BR";
import type { ICustomerTabCounts } from "../hooks/useCustomerHeader";
import type { ICustomerAlert } from "../engine/customerAlerts";
import { OverviewTab } from "./tabs/OverviewTab";
import { OrdersTab } from "./tabs/OrdersTab";
import { QuotesTab } from "./tabs/QuotesTab";
import { VehiclesTab } from "./tabs/VehiclesTab";
import { ConversationsTab } from "./tabs/ConversationsTab";
import { NotesTab } from "./tabs/NotesTab";
import { RecommendationsTab } from "./tabs/RecommendationsTab";
import { CustomerAlertsBand } from "./detail/CustomerAlertsBand";
import { CustomerRelationshipTimeline } from "./detail/CustomerRelationshipTimeline";
import { CustomerPanel } from "./detail/CustomerPanel";
import { CustomerEmptyState } from "./detail/CustomerEmptyState";

const COPY = CUSTOMER_STRINGS.detail.tabs;
const PANELS = CUSTOMER_STRINGS.detail.panels;
const EMPTY = CUSTOMER_STRINGS.detail.empty;

/**
 * The six consolidated tabs. Deliberately a NEW component rather than a change
 * to `ProfileTabs`: that one is also mounted by the conversation fiche (a
 * frozen area) and by the customers-list preview panel, both of which keep the
 * ten-tab layout.
 */
export type CustomerTabKey =
  | "atendimento"
  | "comercial"
  | "frota"
  | "conversas"
  | "cadastro"
  | "notas";

interface ITabDefinition {
  key: CustomerTabKey;
  label: string;
  icon: string;
  /** `alerts` is separate from `counts` because it is derived, not fetched. */
  count?: (counts: ICustomerTabCounts, alerts: number) => number;
  subTabs?: { key: string; label: string }[];
}

const TABS: ITabDefinition[] = [
  {
    key: "atendimento",
    label: COPY.atendimento,
    icon: "mdi:face-agent",
    count: (_, alerts) => alerts,
  },
  {
    key: "comercial",
    label: COPY.comercial,
    icon: "mdi:receipt-text-outline",
    count: (c) => c.comercial,
    subTabs: [
      { key: "pedidos", label: COPY.subOrders },
      { key: "orcamentos", label: COPY.subQuotes },
    ],
  },
  {
    key: "frota",
    label: COPY.frota,
    icon: "mdi:truck-outline",
    count: (c) => c.vehicles,
  },
  {
    key: "conversas",
    label: COPY.conversas,
    icon: "mdi:forum-outline",
    count: (c) => c.conversations,
    subTabs: [
      { key: "conversas", label: COPY.subConversations },
      { key: "midias", label: COPY.subMedia },
      { key: "historico", label: COPY.subHistory },
    ],
  },
  {
    key: "cadastro",
    label: COPY.cadastro,
    icon: "mdi:clipboard-text-outline",
  },
  {
    key: "notas",
    label: COPY.notas,
    icon: "mdi:notebook-edit-outline",
    count: (c) => c.notas,
    subTabs: [
      { key: "notas", label: COPY.subNotes },
      { key: "recomendacoes", label: COPY.subRecommendations },
    ],
  },
];

export interface ICustomerTabsProps {
  customer: ICustomer;
  activeTab: CustomerTabKey;
  onActiveTabChange: (tab: CustomerTabKey) => void;
  counts: ICustomerTabCounts;
  alerts: ICustomerAlert[];
  /** Alert CTAs deep-link into a tab. */
  onGoToTab: (tab: CustomerTabKey) => void;
  /** Opens the inline cadastral editor in the Cadastro tab. */
  cadastraisEditSignal?: number;
  onCadastraisEditConsumed?: () => void;
  /** "Agendar follow-up" on the empty pendings panel. */
  onScheduleFollowUp?: () => void;
}

/**
 * Consolidated tab strip and its panels.
 *
 * Every panel is framed by `CustomerPanel`, which owns the title and the
 * right-hand slot where the sub-tabs live — the kit pairs "Pedidos" with the
 * Pedidos/Orçamentos switch instead of floating the switch above an untitled
 * block. The panels themselves are the existing tab components, mounted with
 * `headless` so their own heading does not compete with the frame.
 *
 * Lazy rendering is preserved: a panel only mounts while its tab is active, so
 * opening "Comercial" is what triggers the orders fetch, not landing here.
 */
export function CustomerTabs({
  customer,
  activeTab,
  onActiveTabChange,
  counts,
  alerts,
  onGoToTab,
  cadastraisEditSignal,
  onCadastraisEditConsumed,
  onScheduleFollowUp,
}: ICustomerTabsProps) {
  const [subTab, setSubTab] = useState<Record<string, string>>({});
  const activeDefinition = TABS.find((tab) => tab.key === activeTab);
  const activeSub = activeDefinition?.subTabs
    ? (subTab[activeTab] ?? activeDefinition.subTabs[0]?.key ?? null)
    : null;

  const subTabsBar = activeDefinition?.subTabs ? (
    <div className="inline-flex items-center gap-0.5 rounded-lg border border-border bg-muted/40 p-0.5">
      {activeDefinition.subTabs.map((sub) => (
        <button
          key={sub.key}
          type="button"
          onClick={() => setSubTab((prev) => ({ ...prev, [activeTab]: sub.key }))}
          className={cn(
            "rounded-md px-3 py-1 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            activeSub === sub.key
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {sub.label}
        </button>
      ))}
    </div>
  ) : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Glassmorphism recipe from docs/dev/ux-guidelines.md §1. No `relative`
          here — Tailwind v4 would fight the sticky positioning (§1 warning). */}
      <div className="sticky top-0 z-20 shrink-0 border-b border-border/40 bg-background/85 shadow-lg shadow-foreground/5 backdrop-blur-2xl backdrop-saturate-[1.8] supports-[backdrop-filter]:bg-background/50">
        <ScrollArea className="w-full">
          <div
            role="tablist"
            aria-label="Seções do cliente"
            className="flex w-max items-stretch gap-1 px-4 sm:px-6"
          >
            {TABS.map((tab) => {
              const isActive = tab.key === activeTab;
              const count = tab.count?.(counts, alerts.length) ?? 0;
              return (
                <button
                  key={tab.key}
                  role="tab"
                  type="button"
                  aria-selected={isActive}
                  onClick={() => onActiveTabChange(tab.key)}
                  className={cn(
                    "inline-flex items-center gap-1.5 border-b-2 px-3.5 py-3 font-display text-sm font-bold uppercase tracking-[0.04em] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    isActive
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon
                    icon={tab.icon}
                    size={15}
                    className={isActive ? "text-primary" : "text-muted-foreground/70"}
                  />
                  {tab.label}
                  {count > 0 && (
                    <span
                      className={cn(
                        "inline-flex h-[17px] min-w-[17px] items-center justify-center rounded-full px-1 font-sans text-[10px] font-extrabold tabular-nums tracking-normal",
                        isActive ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
                      )}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <ScrollBar orientation="horizontal" className="h-1" />
        </ScrollArea>
        <ScrollProgressBar />
      </div>

      <div className="min-h-0 flex-1 px-4 py-3 sm:px-6">
        {activeTab === "atendimento" && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <CustomerPanel
              title={PANELS.pendings}
              className="lg:col-span-2"
              flush={alerts.length === 0}
            >
              {alerts.length > 0 ? (
                <CustomerAlertsBand alerts={alerts} onGoToTab={onGoToTab} />
              ) : (
                <CustomerEmptyState
                  icon="mdi:check-circle-outline"
                  title={EMPTY.noPendingsTitle}
                  text={EMPTY.noPendingsText}
                  cta={onScheduleFollowUp ? EMPTY.noPendingsCta : undefined}
                  onCta={onScheduleFollowUp}
                />
              )}
            </CustomerPanel>
            <CustomerRelationshipTimeline
              customer={customer}
              onSeeAllNotes={() => onGoToTab("notas")}
              className="lg:col-span-1"
            />
          </div>
        )}

        {activeTab === "comercial" && (
          <CustomerPanel
            title={activeSub === "orcamentos" ? PANELS.quotes : PANELS.orders}
            right={subTabsBar}
          >
            {activeSub === "orcamentos" ? (
              <QuotesTab customer={customer} headless />
            ) : (
              <OrdersTab customer={customer} />
            )}
          </CustomerPanel>
        )}

        {activeTab === "frota" && (
          <CustomerPanel title={PANELS.fleet}>
            <VehiclesTab customer={customer} headless />
          </CustomerPanel>
        )}

        {activeTab === "conversas" && (
          <CustomerPanel
            title={
              activeSub === "midias"
                ? PANELS.media
                : activeSub === "historico"
                  ? PANELS.history
                  : PANELS.conversations
            }
            right={subTabsBar}
          >
            {activeSub === "conversas" && <ConversationsTab customer={customer} headless />}
            {activeSub === "midias" && <CustomerMediaTab customerId={customer.id} />}
            {activeSub === "historico" && <AttendanceHistoryPanel customerId={customer.id} />}
          </CustomerPanel>
        )}

        {/* Cadastro keeps its own card grid: `OverviewTab` already renders the
            kit's four panels (cadastrais, status/carteira, tags, portal), so
            framing it again would nest a panel inside a panel. */}
        {activeTab === "cadastro" && (
          <OverviewTab
            customer={customer}
            variant="page"
            cadastraisEditable
            cadastraisEditSignal={cadastraisEditSignal}
            onCadastraisEditConsumed={onCadastraisEditConsumed}
          />
        )}

        {activeTab === "notas" && (
          <CustomerPanel
            title={activeSub === "recomendacoes" ? PANELS.recommendations : PANELS.notes}
            right={subTabsBar}
          >
            {activeSub === "recomendacoes" ? (
              <RecommendationsTab customer={customer} headless />
            ) : (
              <NotesTab customer={customer} headless />
            )}
          </CustomerPanel>
        )}
      </div>
    </div>
  );
}
