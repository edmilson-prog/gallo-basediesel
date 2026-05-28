import { useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { toast } from "sonner";
import type { ID } from "@/shared/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Icon } from "@/components/Icon";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePwaAuth } from "../hooks/usePwaAuth";
import { usePwaPortfolio } from "../hooks/usePwaPortfolio";
import { usePwaVisitsStore } from "../store/visitsStore";
import { customerLabel } from "../utils/customerLabel";
import { PWA_STRINGS as S } from "../i18n/pt-BR";

export interface IPwaNewVisitSearch {
  customerId?: string;
}

export function PWANewVisitPage() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/pwa/agenda/nova" }) as IPwaNewVisitSearch;
  const { session } = usePwaAuth();
  const { data: customers = [] } = usePwaPortfolio(session?.sellerId);
  const addVisit = usePwaVisitsStore((s) => s.addVisit);

  const [customerId, setCustomerId] = useState<ID | undefined>(search.customerId);
  const [scheduledAt, setScheduledAt] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");

  const handleCustomer = (id: ID) => {
    setCustomerId(id);
    const c = customers.find((x) => x.id === id);
    if (c?.address && !address) {
      const a = c.address;
      setAddress(`${a.street}, ${a.number} — ${a.district}, ${a.city}/${a.state}`);
    }
  };

  const canSubmit = Boolean(customerId && scheduledAt && session);

  const handleSubmit = () => {
    if (!canSubmit || !session || !customerId) return;
    addVisit({
      customerId,
      sellerId: session.sellerId,
      scheduledAt: new Date(scheduledAt).toISOString(),
      address: address || undefined,
      notes: notes || undefined,
    });
    toast.success(S.visitCreated);
    void navigate({ to: "/pwa/agenda" });
  };

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => void navigate({ to: "/pwa/agenda" })}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground"
      >
        <Icon icon="mdi:chevron-left" size={14} aria-hidden />
        {S.agendaTitle}
      </button>

      <h1 className="font-display text-xl font-semibold text-foreground">{S.visitTitle}</h1>

      <Card className="space-y-4 p-4">
        <div className="space-y-1.5">
          <Label>{S.visitCustomer}</Label>
          <Select value={customerId ?? ""} onValueChange={handleCustomer}>
            <SelectTrigger className="h-12 text-base">
              <SelectValue placeholder={S.visitSelectCustomer} />
            </SelectTrigger>
            <SelectContent>
              {customers.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {customerLabel(c)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="visit-date">{S.visitDate}</Label>
          <Input
            id="visit-date"
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            className="h-12 text-base"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="visit-address">{S.visitAddress}</Label>
          <Input
            id="visit-address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="h-12 text-base"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="visit-notes">{S.visitNotes}</Label>
          <Textarea
            id="visit-notes"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      </Card>

      <Button className="h-12 w-full" disabled={!canSubmit} onClick={handleSubmit}>
        {S.visitConfirm}
      </Button>
    </div>
  );
}
