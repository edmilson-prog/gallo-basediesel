import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApplicationsSection } from "../ApplicationsSection";
import { EquivalentsSection } from "../EquivalentsSection";
import { PartApplicationsCard } from "../PartApplicationsCard";
import { PartCrossReferenceSection } from "../PartCrossReferenceSection";
import { PartEquivalentsCard } from "../PartEquivalentsCard";
import { PartFiscalCard } from "../PartFiscalCard";
import { PartIdentityCard } from "../PartIdentityCard";
import { PartLogisticsCard } from "../PartLogisticsCard";
import { PartPricingTable } from "../PartPricingTable";
import { PartSuppliersTable } from "../PartSuppliersTable";
import { CATALOG_STRINGS } from "../../../i18n/pt-BR";
import type { IPartLayoutProps } from "./types";

const TABS = CATALOG_STRINGS.detail.tabs;

export function PartLayoutCounter({
  part,
  editing,
  draft,
  onDraftChange,
  priceLocked,
  errors,
}: IPartLayoutProps) {
  const [tab, setTab] = useState("commercial");

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      <aside className="flex flex-col gap-6 lg:col-span-4 lg:sticky lg:top-6 lg:self-start">
        <PartIdentityCard
          part={part}
          editing={editing}
          draft={draft}
          onDraftChange={onDraftChange}
          errors={errors}
        />
        {!editing && <PartApplicationsCard part={part} onViewAll={() => setTab("applications")} />}
        {!editing && <PartEquivalentsCard part={part} onViewAll={() => setTab("equivalents")} />}
      </aside>

      <div className="lg:col-span-8">
        <Tabs value={tab} onValueChange={setTab} className="w-full">
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
          <TabsContent value="fiscal" className="mt-4 space-y-6">
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
          <TabsContent
            value="applications"
            className="mt-4 rounded-lg border border-border bg-card"
          >
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
    </div>
  );
}
