import { useState } from "react";
import type { IConversation, ICustomer } from "@/shared/types";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Icon } from "@/components/Icon";
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
          <TabsList className="inline-flex h-9 w-max gap-0 rounded-none bg-transparent p-0">
            {TAB_ORDER.map((key) => (
              <TabsTrigger
                key={key}
                value={key}
                className="rounded-none border-b-2 border-transparent px-3 py-1 text-xs font-medium text-muted-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
              >
                {CUSTOMER_STRINGS.tabs[key]}
              </TabsTrigger>
            ))}
            {copilotTab != null && (
              <TabsTrigger
                value="copilot"
                className="rounded-none border-b-2 border-transparent px-3 py-1 text-xs font-medium text-muted-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
              >
                <Icon icon="mdi:robot-outline" size={13} className="mr-1 inline-block" />
                Copiloto
              </TabsTrigger>
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
