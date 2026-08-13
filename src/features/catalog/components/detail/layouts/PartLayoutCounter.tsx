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
import { PartPriceHistory } from "../PartPriceHistory";
import { PartPricingTable } from "../PartPricingTable";
import { PartSuppliersTable } from "../PartSuppliersTable";
import { CATALOG_STRINGS } from "../../../i18n/pt-BR";
import type { IPartLayoutProps } from "./types";

const TABS = CATALOG_STRINGS.detail.tabs;

const TAB_IDS = ["commercial", "fiscal", "suppliers", "applications", "equivalents"] as const;

const TAB_LABELS: Record<(typeof TAB_IDS)[number], string> = {
  commercial: TABS.commercial,
  fiscal: TABS.fiscalLogistics,
  suppliers: TABS.suppliers,
  applications: TABS.applications,
  equivalents: TABS.equivalents,
};

/**
 * Counter layout — the composition the design kit specifies (`ui_kits/catalog`):
 * a fixed 440px identity rail on the left and, on the right, a single tabbed
 * panel with the price history hanging below it on the commercial tab.
 */
export function PartLayoutCounter({
  part,
  editing,
  draft,
  onDraftChange,
  priceLocked,
  errors,
  onRequestEdit,
}: IPartLayoutProps) {
  const [tab, setTab] = useState<string>("commercial");

  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[440px_1fr]">
      <aside className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-6 lg:self-start">
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

      <div className="flex min-w-0 flex-col gap-4">
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <Tabs value={tab} onValueChange={setTab} className="w-full">
            <TabsList className="flex h-auto w-full justify-start gap-0.5 overflow-x-auto rounded-none border-b border-border bg-transparent px-2 py-[5px]">
              {TAB_IDS.map((id) => (
                <TabsTrigger
                  key={id}
                  value={id}
                  className="shrink-0 rounded-[7px] px-[15px] py-2.5 text-[13.5px] font-semibold data-[state=active]:bg-muted data-[state=active]:shadow-none"
                >
                  {TAB_LABELS[id]}
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value="commercial" className="mt-0 p-[18px]">
              <PartPricingTable
                part={part}
                editing={editing}
                draft={draft}
                onDraftChange={onDraftChange}
                priceLocked={priceLocked}
                errors={errors}
                headless
                showHistory={false}
                onRequestEdit={onRequestEdit}
              />
            </TabsContent>

            <TabsContent value="fiscal" className="mt-0 space-y-5 p-[18px]">
              <PartFiscalCard
                part={part}
                editing={editing}
                draft={draft}
                onDraftChange={onDraftChange}
                headless
              />
              <div className="border-t border-border pt-5">
                <PartLogisticsCard
                  part={part}
                  editing={editing}
                  draft={draft}
                  onDraftChange={onDraftChange}
                  headless
                />
              </div>
            </TabsContent>

            <TabsContent value="suppliers" className="mt-0 p-[18px]">
              <PartSuppliersTable
                part={part}
                editing={editing}
                draft={draft}
                onDraftChange={onDraftChange}
                headless
              />
            </TabsContent>

            <TabsContent value="applications" className="mt-0">
              <ApplicationsSection
                part={part}
                editing={editing}
                draft={draft}
                onDraftChange={onDraftChange}
              />
            </TabsContent>

            <TabsContent value="equivalents" className="mt-0">
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

        {tab === "commercial" && !editing && <PartPriceHistory part={part} variant="panel" />}
      </div>
    </div>
  );
}
