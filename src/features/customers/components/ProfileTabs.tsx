import { useState } from "react";
import type { IConversation, ICustomer } from "@/shared/types";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { CUSTOMER_STRINGS } from "../i18n/pt-BR";
import { OverviewTab } from "./tabs/OverviewTab";
import { OrdersTab } from "./tabs/OrdersTab";
import { QuotesTab } from "./tabs/QuotesTab";
import { VehiclesTab } from "./tabs/VehiclesTab";
import { ConversationsTab } from "./tabs/ConversationsTab";
import { NotesTab } from "./tabs/NotesTab";
import { RecommendationsTab } from "./tabs/RecommendationsTab";
import { CustomerMediaGallery } from "@/features/media";

export interface IProfileTabsProps {
  customer: ICustomer;
  conversation?: IConversation | null;
  /** Controlled active tab (optional). Falls back to internal state. */
  activeTab?: TabKey;
  onActiveTabChange?: (tab: TabKey) => void;
  /** Layout density of the Overview tab. */
  overviewVariant?: "column" | "page";
  /**
   * Render the tab bar as icon-only triggers with tooltips, for the narrow
   * lateral fiche where the text labels overflow. Defaults to text labels.
   */
  iconOnlyTabs?: boolean;
  /** Optional "Copiloto" tab content injected by the conversation screen (PRD-025). */
  copilotTab?: React.ReactNode;
}

export type TabKey =
  | "overview"
  | "orders"
  | "quotes"
  | "vehicles"
  | "conversations"
  | "midias"
  | "notes"
  | "recommendations";

const TAB_ORDER: TabKey[] = [
  "overview",
  "orders",
  "quotes",
  "vehicles",
  "conversations",
  "midias",
  "notes",
  "recommendations",
];

/** Iconify glyph per tab — used by the icon-only lateral fiche. */
const TAB_ICONS: Record<TabKey, string> = {
  overview: "mdi:account-details-outline",
  orders: "mdi:package-variant-closed",
  quotes: "mdi:file-document-outline",
  vehicles: "mdi:truck-outline",
  conversations: "mdi:chat-outline",
  midias: "mdi:image-multiple-outline",
  notes: "mdi:note-text-outline",
  recommendations: "mdi:lightbulb-outline",
};

const COPILOT_ICON = "mdi:robot-outline";

const TRIGGER_BASE =
  "rounded-none border-b-2 border-transparent py-1 text-xs font-medium text-muted-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none";

/**
 * A single tab trigger. In `iconOnly` mode it shows just the icon with a
 * tooltip (plus a pt-BR `aria-label` for screen readers, since tooltips aren't
 * announced); otherwise the text label, exactly as before.
 */
function ProfileTabTrigger({
  value,
  label,
  icon,
  iconOnly,
}: {
  value: string;
  label: string;
  icon: string;
  iconOnly: boolean;
}) {
  if (!iconOnly) {
    return (
      <TabsTrigger value={value} className={cn(TRIGGER_BASE, "px-3")}>
        {label}
      </TabsTrigger>
    );
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <TabsTrigger
          value={value}
          aria-label={label}
          className={cn(TRIGGER_BASE, "flex flex-1 items-center justify-center px-0")}
        >
          <Icon icon={icon} size={17} />
        </TabsTrigger>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}

/**
 * Tabbed content container. Renders only the active tab body (lazy load —
 * RNF-002): switching to Pedidos kicks off `useOrdersProvider().listByCustomer`
 * only at that moment, not when the profile mounts.
 *
 * Keyboard navigation (←/→ between tabs) is provided by Radix Tabs natively
 * and satisfies RNF-005.
 */
export function ProfileTabs({
  customer,
  conversation,
  activeTab,
  onActiveTabChange,
  overviewVariant = "column",
  iconOnlyTabs = false,
  copilotTab,
}: IProfileTabsProps) {
  // `activeString` accepts any tab value including the dynamic "copilot" extra tab.
  const [internalString, setInternalString] = useState<string>("overview");
  const activeString = activeTab ?? internalString;
  const setActive = (v: string) => {
    setInternalString(v);
    if ((TAB_ORDER as readonly string[]).includes(v)) {
      onActiveTabChange?.(v as TabKey);
    }
  };

  return (
    <Tabs value={activeString} onValueChange={setActive} className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b border-border bg-card px-2">
        <ScrollArea className="w-full">
          <TabsList
            className={cn(
              "h-9 gap-0 rounded-none bg-transparent p-0",
              iconOnlyTabs ? "flex w-full" : "inline-flex w-max",
            )}
          >
            {TAB_ORDER.map((key) => (
              <ProfileTabTrigger
                key={key}
                value={key}
                label={CUSTOMER_STRINGS.tabs[key]}
                icon={TAB_ICONS[key]}
                iconOnly={iconOnlyTabs}
              />
            ))}
            {copilotTab != null && (
              <ProfileTabTrigger
                value="copilot"
                label="Copiloto"
                icon={COPILOT_ICON}
                iconOnly={iconOnlyTabs}
              />
            )}
          </TabsList>
          <ScrollBar orientation="horizontal" className="h-1" />
        </ScrollArea>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <TabsContent value="overview" className="m-0 p-3 focus-visible:outline-none">
          {activeString === "overview" && (
            <OverviewTab customer={customer} variant={overviewVariant} />
          )}
        </TabsContent>
        <TabsContent value="orders" className="m-0 p-3 focus-visible:outline-none">
          {activeString === "orders" && <OrdersTab customer={customer} />}
        </TabsContent>
        <TabsContent value="quotes" className="m-0 p-3 focus-visible:outline-none">
          {activeString === "quotes" && <QuotesTab customer={customer} />}
        </TabsContent>
        <TabsContent value="vehicles" className="m-0 p-3 focus-visible:outline-none">
          {activeString === "vehicles" && <VehiclesTab customer={customer} />}
        </TabsContent>
        <TabsContent value="conversations" className="m-0 p-3 focus-visible:outline-none">
          {activeString === "conversations" && (
            <ConversationsTab customer={customer} currentConversation={conversation} />
          )}
        </TabsContent>
        <TabsContent value="midias" className="m-0 p-0 focus-visible:outline-none">
          {activeString === "midias" && <CustomerMediaGallery customerId={customer.id} />}
        </TabsContent>
        <TabsContent value="notes" className="m-0 p-3 focus-visible:outline-none">
          {activeString === "notes" && <NotesTab customer={customer} />}
        </TabsContent>
        <TabsContent value="recommendations" className="m-0 p-3 focus-visible:outline-none">
          {activeString === "recommendations" && <RecommendationsTab customer={customer} />}
        </TabsContent>
        {copilotTab != null && (
          <TabsContent value="copilot" className="m-0 p-3 focus-visible:outline-none">
            {activeString === "copilot" && copilotTab}
          </TabsContent>
        )}
      </div>
    </Tabs>
  );
}
