import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApplicationsSection } from "../ApplicationsSection";
import { EquivalentsSection } from "../EquivalentsSection";
import { PartCrossReferenceSection } from "../PartCrossReferenceSection";
import { PartFiscalCard } from "../PartFiscalCard";
import { PartIdentityCard } from "../PartIdentityCard";
import { PartLogisticsCard } from "../PartLogisticsCard";
import { PartPricingTable } from "../PartPricingTable";
import { PartSuppliersTable } from "../PartSuppliersTable";
import { CATALOG_STRINGS } from "../../../i18n/pt-BR";
import type { IPartLayoutProps } from "./types";

const TABS = CATALOG_STRINGS.detail.tabs;

export function PartLayoutSheet({
  part,
  editing,
  draft,
  onDraftChange,
  priceLocked,
  errors,
}: IPartLayoutProps) {
  return (
    <div className="space-y-6">
      <PartIdentityCard
        part={part}
        compact
        editing={editing}
        draft={draft}
        onDraftChange={onDraftChange}
        errors={errors}
      />

      <Tabs defaultValue="commercial" className="w-full">
        <TabsList className="flex flex-wrap">
          <TabsTrigger value="commercial" className="cursor-pointer">
            {TABS.commercial}
          </TabsTrigger>
          <TabsTrigger value="fiscal" className="cursor-pointer">
            {TABS.fiscalLogistics}
          </TabsTrigger>
          <TabsTrigger value="suppliers" className="cursor-pointer">
            {TABS.suppliers}
          </TabsTrigger>
          <TabsTrigger value="applications" className="cursor-pointer">
            {TABS.applications}
          </TabsTrigger>
          <TabsTrigger value="equivalents" className="cursor-pointer">
            {TABS.equivalents}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="commercial" className="mt-4">
          <PartPricingTable
            part={part}
            editing={editing}
            draft={draft}
            onDraftChange={onDraftChange}
            priceLocked={priceLocked}
            errors={errors}
          />
        </TabsContent>
        <TabsContent value="fiscal" className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <PartFiscalCard
            part={part}
            editing={editing}
            draft={draft}
            onDraftChange={onDraftChange}
          />
          <PartLogisticsCard
            part={part}
            editing={editing}
            draft={draft}
            onDraftChange={onDraftChange}
          />
        </TabsContent>
        <TabsContent value="suppliers" className="mt-4">
          <PartSuppliersTable
            part={part}
            editing={editing}
            draft={draft}
            onDraftChange={onDraftChange}
          />
        </TabsContent>
        <TabsContent value="applications" className="mt-4 rounded-lg border border-border bg-card">
          <ApplicationsSection
            part={part}
            editing={editing}
            draft={draft}
            onDraftChange={onDraftChange}
          />
        </TabsContent>
        <TabsContent value="equivalents" className="mt-4 rounded-lg border border-border bg-card">
          <PartCrossReferenceSection
            part={part}
            editing={editing}
            draft={draft}
            onDraftChange={onDraftChange}
          />
          <EquivalentsSection
            part={part}
            editing={editing}
            draft={draft}
            onDraftChange={onDraftChange}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
