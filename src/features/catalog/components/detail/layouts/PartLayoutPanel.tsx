import { ApplicationsSection } from "../ApplicationsSection";
import { EquivalentsSection } from "../EquivalentsSection";
import { PartCrossReferenceSection } from "../PartCrossReferenceSection";
import { PartFiscalCard } from "../PartFiscalCard";
import { PartIdentityCard } from "../PartIdentityCard";
import { PartLogisticsCard } from "../PartLogisticsCard";
import { PartPricingTable } from "../PartPricingTable";
import { PartSuppliersTable } from "../PartSuppliersTable";
import type { IPartLayoutProps } from "./types";

export function PartLayoutPanel({ part }: IPartLayoutProps) {
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
      <div className="md:col-span-2 lg:col-span-2 lg:row-span-2">
        <PartIdentityCard part={part} />
      </div>
      <div className="md:col-span-2 lg:col-span-2 lg:row-span-2">
        <PartPricingTable part={part} />
      </div>

      <div className="lg:col-span-2">
        <PartLogisticsCard part={part} />
      </div>
      <div className="lg:col-span-2">
        <PartFiscalCard part={part} />
      </div>

      <div className="md:col-span-2 lg:col-span-4">
        <PartSuppliersTable part={part} />
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card md:col-span-2 lg:col-span-4">
        <PartCrossReferenceSection part={part} />
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card md:col-span-2 lg:col-span-2">
        <EquivalentsSection part={part} />
      </div>
      <div className="overflow-hidden rounded-lg border border-border bg-card md:col-span-2 lg:col-span-2">
        <ApplicationsSection part={part} />
      </div>
    </div>
  );
}
