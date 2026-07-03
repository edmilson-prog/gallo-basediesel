import type { IConversation, IPart, IWhatsAppAccount } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Badge } from "@/components/ui/badge";
import type { PartLookupLayout } from "../../engine/partLookupLayout";
import { priceText } from "../../engine/partInsertText";
import { PART_LOOKUP_STRINGS as S } from "../../i18n/pt-BR";
import { PartDetailActions } from "./PartDetailActions";
import { PartDetailHeadline } from "./PartDetailHeadline";
import { PartDetailDense } from "./PartDetailDense";
import { PartDetailTabs } from "./PartDetailTabs";

export function StockPill({ part }: { part: IPart }) {
  const cls =
    part.stockAvailable <= 0
      ? "text-severity-critical"
      : part.stockAvailable <= part.stockMinimum
        ? "text-severity-warning"
        : "text-severity-success";
  const label = part.stockAvailable <= 0 ? S.stockOut : `● ${part.stockAvailable} un`;
  return <span className={`text-sm font-bold ${cls}`}>{label}</span>;
}

export function PartIdentity({ part }: { part: IPart }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        {part.imageUrl ? (
          <img src={part.imageUrl} alt="" className="h-full w-full rounded-lg object-cover" />
        ) : (
          <Icon icon="mdi:cog-outline" size={20} />
        )}
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm font-bold text-foreground">{part.name}</p>
        <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-muted-foreground">
          SKU {part.sku}
          <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
            {part.brand}
          </Badge>
          {part.unitOfMeasure && <span>· {part.unitOfMeasure}</span>}
        </p>
      </div>
    </div>
  );
}

export function HeadlinePrice({ part }: { part: IPart }) {
  return (
    <div className="grid grid-cols-[1.3fr_1fr] gap-2">
      <div className="rounded-lg border border-primary/40 bg-muted/40 p-2.5">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {S.priceStandard}
        </p>
        <p className="mt-1 text-2xl font-extrabold tabular-nums text-primary">{priceText(part)}</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">à vista</p>
      </div>
      <div className="rounded-lg border border-border bg-muted/40 p-2.5">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{S.stock}</p>
        <div className="mt-1">
          <StockPill part={part} />
        </div>
        {part.storageLocation && (
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {S.location} {part.storageLocation}
          </p>
        )}
      </div>
    </div>
  );
}

export function ApplicationList({ part }: { part: IPart }) {
  if (part.applications.length === 0) {
    return <p className="text-xs text-muted-foreground">Sem aplicação cadastrada.</p>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {part.applications.map((a) => (
        <span
          key={a.id}
          className="rounded-md border border-border bg-muted/40 px-2 py-0.5 text-[11px] text-foreground"
        >
          {a.vehicleBrand} {a.vehicleModel} · {a.yearStart}–{a.yearEnd}
          {a.engine ? ` · ${a.engine}` : ""}
        </span>
      ))}
    </div>
  );
}

export function ReferencesList({ part }: { part: IPart }) {
  const cross = part.crossReferences ?? [];
  return (
    <div className="space-y-1 text-xs text-foreground">
      {part.reference && (
        <p>
          <span className="text-muted-foreground">Fabricante</span> {part.reference}
        </p>
      )}
      {part.oemCodes.length > 0 && (
        <p>
          <span className="text-muted-foreground">{S.oem}</span> {part.oemCodes.join(" · ")}
        </p>
      )}
      {cross.length > 0 && (
        <p>
          <span className="text-muted-foreground">{S.cross}</span>{" "}
          {cross.map((c) => `${c.brand} ${c.code}`).join(" · ")}
        </p>
      )}
    </div>
  );
}

export interface IPartDetailProps {
  part: IPart;
  layout: PartLookupLayout;
  conversation: IConversation;
  whatsappAccount: IWhatsAppAccount | null;
  onBack: () => void;
  onInsertText: (text: string) => void;
}

export function PartDetail({
  part,
  layout,
  conversation,
  whatsappAccount,
  onBack,
  onInsertText,
}: IPartDetailProps) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1 border-b border-border px-3 py-2 text-xs text-muted-foreground hover:text-foreground"
      >
        <Icon icon="mdi:arrow-left" size={14} /> {S.back}
      </button>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {layout === "dense" ? (
          <PartDetailDense part={part} />
        ) : layout === "tabs" ? (
          <PartDetailTabs part={part} />
        ) : (
          <PartDetailHeadline part={part} />
        )}
      </div>
      <PartDetailActions
        part={part}
        conversation={conversation}
        whatsappAccount={whatsappAccount}
        onInsertText={onInsertText}
      />
    </div>
  );
}
