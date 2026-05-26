import { Icon } from "@/components/Icon";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { PlaceholderSection } from "../components/PlaceholderSection";

interface IDivisionCard {
  key: "parts" | "service" | "industrial";
  name: string;
  description: string;
  color: string;
  /** Background tint applied to the card. */
  tint: string;
  icon: string;
  active: boolean;
}

const DIVISIONS: IDivisionCard[] = [
  {
    key: "parts",
    name: "PARTS",
    description: "Peças pesadas — núcleo comercial atual da GALLO.",
    color: "text-emerald-700 dark:text-emerald-300",
    tint: "border-emerald-500/40 bg-emerald-500/10",
    icon: "mdi:cog-outline",
    active: true,
  },
  {
    key: "service",
    name: "SERVICE",
    description: "Oficina e serviços — disponível quando GALLO ativar essa frente.",
    color: "text-red-700 dark:text-red-300",
    tint: "border-red-500/30 bg-red-500/5",
    icon: "mdi:wrench-outline",
    active: false,
  },
  {
    key: "industrial",
    name: "INDUSTRIAL",
    description: "Linha industrial — disponível quando GALLO ativar essa frente.",
    color: "text-amber-700 dark:text-amber-300",
    tint: "border-amber-500/30 bg-amber-500/5",
    icon: "mdi:factory",
    active: false,
  },
];

export function DivisionsPlaceholderPage() {
  return (
    <PlaceholderSection
      title="Divisões"
      description="GALLO opera como marca guarda-chuva com três submarcas. Ative cada uma quando estiver pronta para começar a vender pela frente correspondente."
      icon="mdi:shape-outline"
      whatComes={[
        "Habilitar SERVICE e INDUSTRIAL quando a operação correspondente estiver pronta",
        "Definir vendedores autorizados em cada divisão",
        "Configurar paleta visual e templates de comunicação por submarca",
        "Métricas e metas separadas por divisão",
      ]}
      statusNote="No MVP apenas PARTS está habilitada. SERVICE e INDUSTRIAL permanecem modeladas mas dormentes."
    >
      <div className="grid gap-3 sm:grid-cols-3">
        {DIVISIONS.map((d) => (
          <div
            key={d.key}
            className={cn("rounded-lg border p-4", d.tint, !d.active && "opacity-80")}
          >
            <div className="flex items-center justify-between gap-2">
              <Icon icon={d.icon} size={22} className={d.color} />
              <Switch checked={d.active} disabled aria-label={`Ativar ${d.name}`} />
            </div>
            <p className={cn("mt-3 text-sm font-semibold", d.color)}>{d.name}</p>
            <p className="mt-1 text-xs text-muted-foreground">{d.description}</p>
            <Badge variant={d.active ? "default" : "outline"} className="mt-3">
              {d.active ? "Habilitada" : "Disponível em fase futura"}
            </Badge>
          </div>
        ))}
      </div>
    </PlaceholderSection>
  );
}
