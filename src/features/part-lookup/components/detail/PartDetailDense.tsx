import type { ReactNode } from "react";
import type { IPart } from "@/shared/types";
import { PART_LOOKUP_STRINGS as S } from "../../i18n/pt-BR";
import { PartIdentity, HeadlinePrice, ApplicationList, ReferencesList } from "./PartDetail";
import { PriceChannelsTable } from "./PriceChannelsTable";
import { CostMarginGate } from "./CostMarginGate";

function Block({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="border-t border-border px-3 py-2.5">
      <p className="mb-1.5 text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}

export function PartDetailDense({ part }: { part: IPart }) {
  return (
    <div>
      <div className="p-3">
        <PartIdentity part={part} />
      </div>
      <div className="px-3 pb-3">
        <HeadlinePrice part={part} />
      </div>
      <Block label={S.channels}>
        <PriceChannelsTable part={part} />
      </Block>
      <Block label={S.application}>
        <ApplicationList part={part} />
      </Block>
      <Block label={S.references}>
        <ReferencesList part={part} />
      </Block>
      <CostMarginGate part={part} />
    </div>
  );
}
