import { useState } from "react";
import { toast } from "sonner";
import { Icon } from "@/components/Icon";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { DistributionMode, IDistributionSettings } from "@/shared/types";

interface IModeSectionProps {
  settings: IDistributionSettings;
  saving: boolean;
  onChange: (patch: Partial<IDistributionSettings>) => Promise<void>;
}

const MODE_OPTIONS: {
  value: DistributionMode;
  label: string;
  description: string;
  icon: string;
}[] = [
  {
    value: "automatic",
    label: "Automático",
    description: "Engine percorre toda a cascata sem intervenção; vendedor recebe notificação.",
    icon: "mdi:robot-confused-outline",
  },
  {
    value: "hybrid",
    label: "Híbrido (recomendado)",
    description: "Carteira respeitada; o restante das conversas vai para o SDR antes do humano.",
    icon: "mdi:lightning-bolt-outline",
  },
  {
    value: "sdr_first",
    label: "SDR-first",
    description: "Toda conversa nova passa primeiro pelo SDR; humano só assume sob escalonamento.",
    icon: "mdi:robot-happy-outline",
  },
  {
    value: "manual",
    label: "Manual",
    description: "Conversas órfãs aguardam atribuição manual do gestor — engine pausado.",
    icon: "mdi:account-supervisor-outline",
  },
];

export function ModeSection({ settings, saving, onChange }: IModeSectionProps) {
  const [pending, setPending] = useState<DistributionMode | null>(null);

  const handleSelect = (mode: DistributionMode) => {
    if (mode === settings.mode || saving) return;
    setPending(mode);
  };

  const confirm = async () => {
    if (!pending) return;
    try {
      await onChange({ mode: pending });
      toast.success(`Modo de operação atualizado: ${labelOf(pending)}`);
    } catch {
      toast.error("Não foi possível salvar o modo.");
    } finally {
      setPending(null);
    }
  };

  return (
    <section aria-labelledby="distribution-mode" className="space-y-3">
      <header>
        <h2 id="distribution-mode" className="text-base font-semibold">
          Modo de operação
        </h2>
        <p className="text-sm text-muted-foreground">
          Define como o engine reage a uma conversa nova.
        </p>
      </header>
      <div className="grid gap-3 md:grid-cols-2">
        {MODE_OPTIONS.map((opt) => {
          const selected = settings.mode === opt.value;
          return (
            <Card
              key={opt.value}
              onClick={() => handleSelect(opt.value)}
              className={cn(
                "cursor-pointer transition border",
                selected ? "border-primary bg-primary/5" : "border-border hover:bg-accent/30",
              )}
              role="button"
              aria-pressed={selected}
            >
              <CardContent className="flex items-start gap-3 p-4">
                <Icon
                  icon={opt.icon}
                  size={22}
                  className={selected ? "text-primary" : "text-muted-foreground"}
                />
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{opt.label}</span>
                    {selected && (
                      <Icon icon="mdi:check-circle" size={14} className="text-primary" />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{opt.description}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <AlertDialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar mudança de modo</AlertDialogTitle>
            <AlertDialogDescription>
              Confirma alterar para <strong>{pending ? labelOf(pending) : ""}</strong>? As próximas
              conversas usarão esta regra imediatamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirm()}>Confirmar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function labelOf(mode: DistributionMode): string {
  return MODE_OPTIONS.find((o) => o.value === mode)?.label ?? mode;
}
