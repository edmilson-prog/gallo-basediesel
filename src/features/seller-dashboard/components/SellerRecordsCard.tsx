// src/features/seller-dashboard/components/SellerRecordsCard.tsx
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/Icon";
import { SELLER_DASHBOARD_STRINGS as S } from "../i18n/pt-BR";

interface ISellerRecordExample {
  icon: string;
  label: string;
  value: string;
  hint: string;
}

const RECORD_EXAMPLES: ISellerRecordExample[] = [
  {
    icon: "mdi:timer-sand",
    label: "Maior atendimento",
    value: "6d 14h",
    hint: "exemplo — atribuição até fechamento",
  },
  {
    icon: "mdi:lightning-bolt",
    label: "Mais rápido",
    value: "4 min",
    hint: "exemplo — do primeiro contato à resposta",
  },
  { icon: "mdi:fire", label: "Sequência", value: "9 dias", hint: "exemplo — batendo a meta diária" },
  { icon: "mdi:clock-outline", label: "Seu pico", value: "ter · 14–16h", hint: "exemplo — quando você mais fecha" },
  { icon: "mdi:cog-outline", label: "Peça mais vendida", value: "—", hint: "exemplo — no mês corrente" },
  { icon: "mdi:heart-outline", label: "Cliente mais frequente", value: "—", hint: "exemplo — nos últimos 12 meses" },
];

export function SellerRecordsCard() {
  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Icon icon="mdi:sparkles-outline" size={16} className="text-primary" />
          {S.recordsTitle}
        </div>
        <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {S.recordsComingSoon}
        </span>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {RECORD_EXAMPLES.map((r) => (
          <div key={r.label} className="rounded-lg border border-border bg-muted/20 p-3">
            <div className="mb-2 flex items-center gap-2">
              <Icon icon={r.icon} size={14} className="text-muted-foreground" />
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {r.label}
              </span>
            </div>
            <div className="font-display text-lg font-bold text-foreground">{r.value}</div>
            <p className="mt-1 text-[11px] text-muted-foreground">{r.hint}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}
