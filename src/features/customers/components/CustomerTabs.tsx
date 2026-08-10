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
import { AtendimentoTab } from "./tabs/AtendimentoTab";
import { OverviewTab } from "./tabs/OverviewTab";
import { OrdersTab } from "./tabs/OrdersTab";
import { QuotesTab } from "./tabs/QuotesTab";
import { VehiclesTab } from "./tabs/VehiclesTab";
import { ConversationsTab } from "./tabs/ConversationsTab";
import { NotesTab } from "./tabs/NotesTab";
import { RecommendationsTab } from "./tabs/RecommendationsTab";
import { CustomerAlertsBand } from "./detail/CustomerAlertsBand";
import { CustomerRelationshipTimeline } from "./detail/CustomerRelationshipTimeline";

const COPY = CUSTOMER_STRINGS.detail.tabs;

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
  count?: (counts: ICustomerTabCounts) => number;
  subTabs?: { key: string; label: string }[];
}

const TABS: ITabDefinition[] = [
  {
    key: "atendimento",
    label: COPY.atendimento,
    icon: "mdi:face-agent",
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
}

/**
 * Consolidated tab strip and its panels.
 *
 * The panels are the existing tab components, mounted unchanged — this refactor
 * regroups navigation, it does not rewrite content. Lazy rendering is preserved:
 * a panel only mounts while its tab is active, so opening "Comercial" is what
 * triggers the orders fetch, not landing on the page.
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
}: ICustomerTabsProps) {
  const [subTab, setSubTab] = useState<Record<string, string>>({});
  const activeDefinition = TABS.find((tab) => tab.key === activeTab);
  const activeSub = activeDefinition?.subTabs
    ? (subTab[activeTab] ?? activeDefinition.subTabs[0]?.key ?? null)
    : null;

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
              const count = tab.count?.(counts) ?? 0;
              return (
                <button
                  key={tab.key}
                  role="tab"
                  type="button"
                  aria-selected={isActive}
                  onClick={() => onActiveTabChange(tab.key)}
                  className={cn(
                    "inline-flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-[13px] font-semibold uppercase tracking-wide transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
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
                        "inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold tabular-nums",
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

      {activeDefinition?.subTabs && (
        <div className="flex shrink-0 items-center gap-1 px-4 pt-3 sm:px-6">
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
        </div>
      )}

      <div className="min-h-0 flex-1 px-4 py-3 sm:px-6">
        {activeTab === "atendimento" && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="space-y-3 lg:col-span-2">
              <CustomerAlertsBand alerts={alerts} onGoToTab={onGoToTab} />
              <AtendimentoTab customer={customer} />
            </div>
            <CustomerRelationshipTimeline
              customer={customer}
              onSeeAllNotes={() => onGoToTab("notas")}
              className="lg:col-span-1"
            />
          </div>
        )}

        {activeTab === "comercial" &&
          (activeSub === "orcamentos" ? (
            <QuotesTab customer={customer} />
          ) : (
            <OrdersTab customer={customer} />
          ))}

        {activeTab === "frota" && <VehiclesTab customer={customer} />}

        {activeTab === "conversas" && activeSub === "conversas" && (
          <ConversationsTab customer={customer} />
        )}
        {activeTab === "conversas" && activeSub === "midias" && (
          <CustomerMediaTab customerId={customer.id} />
        )}
        {activeTab === "conversas" && activeSub === "historico" && (
          <AttendanceHistoryPanel customerId={customer.id} />
        )}

        {activeTab === "cadastro" && (
          <OverviewTab
            customer={customer}
            variant="page"
            cadastraisEditable
            cadastraisEditSignal={cadastraisEditSignal}
            onCadastraisEditConsumed={onCadastraisEditConsumed}
          />
        )}

        {activeTab === "notas" &&
          (activeSub === "recomendacoes" ? (
            <RecommendationsTab customer={customer} />
          ) : (
            <NotesTab customer={customer} />
          ))}
      </div>
    </div>
  );
}
