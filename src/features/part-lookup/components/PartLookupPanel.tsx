import { useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { IConversation, IPart, IWhatsAppAccount } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { usePartLookup } from "../hooks/usePartLookup";
import { usePartLookupLayout } from "../hooks/usePartLookupLayout";
import { useRecentParts } from "../hooks/useRecentParts";
import { PartSearchBar } from "./PartSearchBar";
import { PartResultList } from "./PartResultList";
import { LayoutModePicker } from "./LayoutModePicker";
import { PartDetail } from "./detail/PartDetail";
import { PART_LOOKUP_STRINGS as S } from "../i18n/pt-BR";

export interface IPartLookupPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversation: IConversation;
  whatsappAccount: IWhatsAppAccount | null;
  onInsertText: (text: string) => void;
}

export function PartLookupPanel(props: IPartLookupPanelProps) {
  const { open, onOpenChange, conversation, whatsappAccount, onInsertText } = props;
  const search = usePartLookup();
  const { layout, setLayout } = usePartLookupLayout();
  const { recentIds, remember } = useRecentParts();
  const [selected, setSelected] = useState<IPart | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  // Recent parts shown when the query is empty (search over the loaded window).
  const recentParts = useMemo(
    () =>
      recentIds
        .map((id) => search.list.data.find((p) => p.id === id))
        .filter((p): p is IPart => Boolean(p)),
    [recentIds, search.list.data],
  );

  if (!open) return null;

  const showRecent = search.query.trim() === "" && recentParts.length > 0;
  const parts = showRecent ? recentParts : search.visibleParts;

  const handleSelect = (part: IPart) => {
    setSelected(part);
    remember(part.id);
  };

  return (
    <aside
      className="flex h-full w-[380px] shrink-0 flex-col border-l border-border bg-card"
      aria-label={S.panelTitle}
    >
      <header className="flex items-center justify-between border-b border-border bg-background/80 px-3 py-2 backdrop-blur">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-primary">
          <Icon icon="mdi:magnify-scan" size={16} /> {S.panelTitle}
        </span>
        <span className="flex items-center gap-1">
          <LayoutModePicker layout={layout} onLayoutChange={setLayout} />
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            aria-label="Fechar"
            onClick={() => onOpenChange(false)}
          >
            <Icon icon="mdi:close" size={16} />
          </Button>
        </span>
      </header>

      {selected ? (
        <PartDetail
          part={selected}
          layout={layout}
          conversation={conversation}
          whatsappAccount={whatsappAccount}
          onBack={() => setSelected(null)}
          onInsertText={onInsertText}
        />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="border-b border-border p-3">
            <PartSearchBar
              query={search.query}
              onQueryChange={search.setQuery}
              vehicleBrand={search.vehicleBrand}
              onVehicleBrandChange={search.setVehicleBrand}
              inStockOnly={search.inStockOnly}
              onInStockToggle={() => search.setInStockOnly(!search.inStockOnly)}
              inputRef={inputRef}
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {showRecent && (
              <p className="mb-2 text-[11px] uppercase tracking-wide text-muted-foreground">
                {S.recent}
              </p>
            )}
            <PartResultList
              parts={parts}
              isLoading={search.list.isLoading}
              isError={search.list.isError}
              query={search.query}
              onSelect={handleSelect}
              onRetry={search.list.refetch}
              onOpenCatalog={() => void navigate({ to: "/app/catalogo" })}
            />
          </div>
        </div>
      )}
    </aside>
  );
}
