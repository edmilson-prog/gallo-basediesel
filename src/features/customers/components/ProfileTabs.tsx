import { useState } from "react";
import type { IConversation, ICustomer } from "@/shared/types";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { CUSTOMER_STRINGS } from "../i18n/pt-BR";
import { OverviewTab } from "./tabs/OverviewTab";
import { OrdersTab } from "./tabs/OrdersTab";
import { QuotesTab } from "./tabs/QuotesTab";
import { VehiclesTab } from "./tabs/VehiclesTab";
import { ConversationsTab } from "./tabs/ConversationsTab";
import { NotesTab } from "./tabs/NotesTab";
import { RecommendationsTab } from "./tabs/RecommendationsTab";

export interface IProfileTabsProps {
  customer: ICustomer;
  conversation?: IConversation | null;
}

type TabKey =
  | "overview"
  | "orders"
  | "quotes"
  | "vehicles"
  | "conversations"
  | "notes"
  | "recommendations";

const TAB_ORDER: TabKey[] = [
  "overview",
  "orders",
  "quotes",
  "vehicles",
  "conversations",
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
export function ProfileTabs({ customer, conversation }: IProfileTabsProps) {
  const [active, setActive] = useState<TabKey>("overview");

  return (
    <Tabs
      value={active}
      onValueChange={(v) => setActive(v as TabKey)}
      className="flex min-h-0 flex-1 flex-col"
    >
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
          </TabsList>
          <ScrollBar orientation="horizontal" className="h-1" />
        </ScrollArea>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <TabsContent value="overview" className="m-0 p-3 focus-visible:outline-none">
          {active === "overview" && <OverviewTab customer={customer} />}
        </TabsContent>
        <TabsContent value="orders" className="m-0 p-3 focus-visible:outline-none">
          {active === "orders" && <OrdersTab customer={customer} />}
        </TabsContent>
        <TabsContent value="quotes" className="m-0 p-3 focus-visible:outline-none">
          {active === "quotes" && <QuotesTab customer={customer} />}
        </TabsContent>
        <TabsContent value="vehicles" className="m-0 p-3 focus-visible:outline-none">
          {active === "vehicles" && <VehiclesTab customer={customer} />}
        </TabsContent>
        <TabsContent value="conversations" className="m-0 p-3 focus-visible:outline-none">
          {active === "conversations" && (
            <ConversationsTab customer={customer} currentConversation={conversation} />
          )}
        </TabsContent>
        <TabsContent value="notes" className="m-0 p-3 focus-visible:outline-none">
          {active === "notes" && <NotesTab customer={customer} />}
        </TabsContent>
        <TabsContent value="recommendations" className="m-0 p-3 focus-visible:outline-none">
          {active === "recommendations" && <RecommendationsTab customer={customer} />}
        </TabsContent>
      </div>
    </Tabs>
  );
}
