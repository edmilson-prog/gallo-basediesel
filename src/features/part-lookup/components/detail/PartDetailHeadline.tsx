import type { ReactNode } from "react";
import type { IPart } from "@/shared/types";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Icon } from "@/components/Icon";
import { PART_LOOKUP_STRINGS as S } from "../../i18n/pt-BR";
import { PartIdentity, HeadlinePrice, ApplicationList, ReferencesList } from "./PartDetail";
import { PriceChannelsTable } from "./PriceChannelsTable";
import { CostMarginGate } from "./CostMarginGate";

function Section({
  label,
  children,
  defaultOpen = false,
}: {
  label: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <Collapsible defaultOpen={defaultOpen} className="border-t border-border">
      <CollapsibleTrigger className="flex w-full items-center justify-between px-3 py-2.5 text-xs uppercase tracking-wide text-muted-foreground">
        {label}
        <Icon icon="mdi:chevron-down" size={16} />
      </CollapsibleTrigger>
      <CollapsibleContent className="px-3 pb-3">{children}</CollapsibleContent>
    </Collapsible>
  );
}

export function PartDetailHeadline({ part }: { part: IPart }) {
  return (
    <div>
      <div className="p-3">
        <PartIdentity part={part} />
      </div>
      <div className="px-3 pb-3">
        <HeadlinePrice part={part} />
      </div>
      <Section label={S.channels}>
        <PriceChannelsTable part={part} />
      </Section>
      <Section label={S.application} defaultOpen>
        <ApplicationList part={part} />
      </Section>
      <Section label={S.references}>
        <ReferencesList part={part} />
      </Section>
      <CostMarginGate part={part} />
    </div>
  );
}
