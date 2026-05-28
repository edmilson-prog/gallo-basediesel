import type { IPart } from "@/shared/types";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApplicationsTab } from "./ApplicationsTab";
import { EquivalentsTab } from "./EquivalentsTab";
import { SpecificationsTab } from "./SpecificationsTab";
import { STOREFRONT_PRODUCT_STRINGS as S } from "../i18n/pt-BR";

export interface IProductTabsProps {
  part: IPart;
}

/**
 * Three-tab section for the product detail page (PRD-063 RF-012).
 * Default tab is Aplicações — the most actionable for B2B buyers.
 */
export function ProductTabs({ part }: IProductTabsProps) {
  return (
    <Tabs defaultValue="applications" className="w-full">
      <TabsList className="w-full justify-start overflow-x-auto bg-muted/40">
        <TabsTrigger value="applications">{S.tabApplications}</TabsTrigger>
        <TabsTrigger value="equivalents">{S.tabEquivalents}</TabsTrigger>
        <TabsTrigger value="specifications">{S.tabSpecifications}</TabsTrigger>
      </TabsList>
      <TabsContent value="applications" className="mt-4">
        <ApplicationsTab part={part} />
      </TabsContent>
      <TabsContent value="equivalents" className="mt-4">
        <EquivalentsTab part={part} />
      </TabsContent>
      <TabsContent value="specifications" className="mt-4">
        <SpecificationsTab part={part} />
      </TabsContent>
    </Tabs>
  );
}
