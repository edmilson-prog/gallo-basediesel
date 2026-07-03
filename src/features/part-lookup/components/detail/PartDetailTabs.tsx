import { useState } from "react";
import type { IPart } from "@/shared/types";
import { PART_LOOKUP_STRINGS as S } from "../../i18n/pt-BR";
import { PartIdentity, HeadlinePrice, ApplicationList, ReferencesList } from "./PartDetail";
import { PriceChannelsTable } from "./PriceChannelsTable";
import { CostMarginGate } from "./CostMarginGate";

type Tab = "price" | "application" | "refs";

export function PartDetailTabs({ part }: { part: IPart }) {
  const [tab, setTab] = useState<Tab>("price");
  const tabs: { id: Tab; label: string }[] = [
    { id: "price", label: S.channels },
    { id: "application", label: S.application },
    { id: "refs", label: S.references },
  ];
  return (
    <div>
      <div className="bg-gradient-to-b from-primary/[0.07] to-transparent p-3">
        <PartIdentity part={part} />
      </div>
      <div className="px-3 pb-3">
        <HeadlinePrice part={part} />
      </div>
      <div className="flex border-t border-border">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            aria-selected={tab === t.id}
            className={`flex-1 border-b-2 px-2 py-2 text-xs ${
              tab === t.id
                ? "border-primary font-semibold text-primary"
                : "border-transparent text-muted-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="min-h-[70px] p-3">
        {tab === "price" && <PriceChannelsTable part={part} />}
        {tab === "application" && <ApplicationList part={part} />}
        {tab === "refs" && <ReferencesList part={part} />}
      </div>
      <CostMarginGate part={part} />
    </div>
  );
}
