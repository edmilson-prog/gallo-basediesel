import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { ID, ISeller, SellerAvailability } from "@/shared/types";
import { Icon } from "@/components/Icon";
import {
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";
import { useSellersProvider } from "@/providers/data";
import { auditLog } from "@/features/rbac/utils/auditLog";

const OPTIONS: {
  value: SellerAvailability;
  label: string;
  icon: string;
  dotClass: string;
}[] = [
  { value: "online", label: "Online", icon: "mdi:circle", dotClass: "text-emerald-500" },
  { value: "ausente", label: "Ausente", icon: "mdi:circle", dotClass: "text-amber-500" },
  { value: "ocupado", label: "Ocupado", icon: "mdi:circle", dotClass: "text-orange-500" },
  { value: "offline", label: "Offline", icon: "mdi:circle", dotClass: "text-muted-foreground" },
];

interface IAvailabilityToggleProps {
  sellerId: ID;
}

/**
 * Inline radio block embedded in the avatar dropdown of the TopBar (PRD-013).
 *
 * Vendedores control their own availability; Owner/Gestor can change others'
 * from the team management screens (PRD-019 / PRD-014). The component is
 * intentionally compact so it nests cleanly inside `<DropdownMenuContent>`.
 */
export function AvailabilityToggle({ sellerId }: IAvailabilityToggleProps) {
  const sellersProvider = useSellersProvider();
  const [availability, setAvailability] = useState<SellerAvailability | null>(null);
  const [seller, setSeller] = useState<ISeller | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void sellersProvider
      .get(sellerId)
      .then((s) => {
        if (cancelled) return;
        setSeller(s);
        setAvailability(s.availability);
      })
      .catch(() => {
        if (!cancelled) setAvailability(null);
      });
    return () => {
      cancelled = true;
    };
  }, [sellersProvider, sellerId]);

  const handleSelect = async (next: SellerAvailability) => {
    if (busy || next === availability || !seller) return;
    const previous = availability;
    setBusy(true);
    setAvailability(next);
    try {
      await sellersProvider.setAvailability(sellerId, next);
      auditLog({
        action: "seller.availability.update",
        resource: "seller",
        resourceId: sellerId,
        before: { availability: previous },
        after: { availability: next },
      });
      const optionLabel = OPTIONS.find((o) => o.value === next)?.label ?? next;
      toast.success(`Disponibilidade atualizada: ${optionLabel}`);
    } catch {
      setAvailability(previous);
      toast.error("Não foi possível atualizar disponibilidade.");
    } finally {
      setBusy(false);
    }
  };

  if (!availability) {
    return (
      <div className="px-2 py-1.5 text-xs text-muted-foreground">Carregando disponibilidade…</div>
    );
  }

  return (
    <div>
      <DropdownMenuLabel className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        Disponibilidade
      </DropdownMenuLabel>
      <DropdownMenuRadioGroup
        value={availability}
        onValueChange={(v) => void handleSelect(v as SellerAvailability)}
      >
        {OPTIONS.map((opt) => (
          <DropdownMenuRadioItem
            key={opt.value}
            value={opt.value}
            disabled={busy}
            className="gap-2 text-sm"
          >
            <Icon icon={opt.icon} size={10} className={opt.dotClass} />
            {opt.label}
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
    </div>
  );
}
