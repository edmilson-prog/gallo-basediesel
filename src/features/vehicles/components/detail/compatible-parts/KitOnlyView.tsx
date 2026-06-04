import type { IPart } from "@/shared/types";
import { VEHICLE_STRINGS } from "@/features/vehicles/i18n/pt-BR";
import { CompatiblePartRow } from "./CompatiblePartRow";
import { CompatiblePartsEmpty } from "./CompatiblePartsEmpty";

export interface IKitOnlyViewProps {
  inKit: IPart[];
  onAddToQuote?: (p: IPart) => void;
}

const COPY = VEHICLE_STRINGS.detail.compatibleV2;

export function KitOnlyView({ inKit, onAddToQuote }: IKitOnlyViewProps) {
  if (inKit.length === 0) {
    return (
      <CompatiblePartsEmpty
        icon="mdi:package-variant-closed"
        title={COPY.emptyKitOnly}
        description=""
      />
    );
  }

  return (
    <ul className="divide-y divide-border">
      {inKit.map((part) => (
        <li key={part.id}>
          <CompatiblePartRow part={part} inKit={true} onAddToQuote={onAddToQuote} />
        </li>
      ))}
    </ul>
  );
}
