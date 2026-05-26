import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Icon } from "@/components/Icon";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type {
  DistributionCriterion,
  IDistributionCriteriaEnabled,
  IDistributionSettings,
} from "@/shared/types";

interface ICriteriaSectionProps {
  settings: IDistributionSettings;
  saving: boolean;
  onChange: (patch: Partial<IDistributionSettings>) => Promise<void>;
}

const CRITERION_META: Record<
  DistributionCriterion,
  { label: string; description: string; icon: string; disclaimer?: string }
> = {
  carteira: {
    label: "Carteira existente",
    description: "Se o cliente já tem vendedor responsável, a conversa vai direto para ele.",
    icon: "mdi:account-tie-outline",
    disclaimer:
      "Desligar quebra a continuidade da carteira — comissões e métricas de retenção podem ficar inconsistentes.",
  },
  especialidade: {
    label: "Especialidade",
    description: "Direciona para vendedor com expertise na marca/produto mencionado.",
    icon: "mdi:school-outline",
  },
  round_robin: {
    label: "Round-robin",
    description: "Distribui em revezamento entre vendedores online — equilibra exposição.",
    icon: "mdi:rotate-3d-variant",
  },
  carga: {
    label: "Carga",
    description: "Vendedor com menos conversas ativas recebe a próxima.",
    icon: "mdi:scale-balance",
  },
  fallback: {
    label: "Fallback (SDR / Fila)",
    description:
      "Quando ninguém disponível atende: SDR assume se ativado, senão a conversa entra em fila para o gestor.",
    icon: "mdi:shield-half-full",
  },
};

export function CriteriaSection({ settings, saving, onChange }: ICriteriaSectionProps) {
  const [draftOrder, setDraftOrder] = useState<DistributionCriterion[]>(settings.criteriaOrder);
  const [draftEnabled, setDraftEnabled] = useState<IDistributionCriteriaEnabled>(
    settings.criteriaEnabled,
  );

  const dirty = useMemo(() => {
    const orderChanged = draftOrder.some((c, i) => settings.criteriaOrder[i] !== c);
    const enabledChanged = (Object.keys(draftEnabled) as DistributionCriterion[]).some(
      (k) => draftEnabled[k] !== settings.criteriaEnabled[k],
    );
    return orderChanged || enabledChanged;
  }, [draftOrder, draftEnabled, settings]);

  const enabledCount = Object.values(draftEnabled).filter(Boolean).length;
  const onlyFallbackLeft = enabledCount === 1 && draftEnabled.fallback;

  const move = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= draftOrder.length) return;
    const next = [...draftOrder];
    [next[index], next[target]] = [next[target], next[index]];
    setDraftOrder(next);
  };

  const toggle = (criterion: DistributionCriterion, next: boolean) => {
    if (!next && criterion === "fallback") {
      toast.error("Fallback não pode ser desligado — ele garante a rede final de segurança.");
      return;
    }
    setDraftEnabled((prev) => ({ ...prev, [criterion]: next }));
  };

  const save = async () => {
    try {
      await onChange({ criteriaOrder: draftOrder, criteriaEnabled: draftEnabled });
      toast.success("Critérios atualizados.");
    } catch {
      toast.error("Não foi possível salvar critérios.");
    }
  };

  const reset = () => {
    setDraftOrder(settings.criteriaOrder);
    setDraftEnabled(settings.criteriaEnabled);
  };

  return (
    <section aria-labelledby="distribution-criteria" className="space-y-3">
      <header className="flex items-baseline justify-between gap-2">
        <div>
          <h2 id="distribution-criteria" className="text-base font-semibold">
            Critérios em cascata
          </h2>
          <p className="text-sm text-muted-foreground">
            Reordene e ative/desative cada etapa. A engine para na primeira que produzir vencedor.
          </p>
        </div>
        {dirty && (
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={reset} disabled={saving}>
              Descartar
            </Button>
            <Button size="sm" onClick={() => void save()} disabled={saving}>
              Salvar critérios
            </Button>
          </div>
        )}
      </header>

      {onlyFallbackLeft && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
          ⚠️ Você desligou todos os critérios anteriores — todas as conversas cairão direto no
          fallback.
        </div>
      )}

      <ol className="space-y-2">
        {draftOrder.map((criterion, index) => {
          const meta = CRITERION_META[criterion];
          const enabled = draftEnabled[criterion];
          return (
            <li key={criterion}>
              <Card>
                <CardContent className="flex items-center gap-3 p-3">
                  <div className="flex w-7 flex-col items-center gap-0.5">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5"
                      onClick={() => move(index, -1)}
                      disabled={index === 0}
                      aria-label="Subir critério"
                    >
                      <Icon icon="mdi:chevron-up" size={14} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5"
                      onClick={() => move(index, 1)}
                      disabled={index === draftOrder.length - 1}
                      aria-label="Descer critério"
                    >
                      <Icon icon="mdi:chevron-down" size={14} />
                    </Button>
                  </div>

                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                    {index + 1}
                  </span>

                  <Icon
                    icon={meta.icon}
                    size={22}
                    className={enabled ? "text-foreground" : "text-muted-foreground"}
                  />

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium">{meta.label}</span>
                      {meta.disclaimer && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="cursor-help text-amber-500">
                              <Icon icon="mdi:alert-circle-outline" size={14} />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>{meta.disclaimer}</TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">{meta.description}</p>
                  </div>

                  <Switch
                    checked={enabled}
                    onCheckedChange={(v) => toggle(criterion, Boolean(v))}
                    aria-label={`Ativar critério ${meta.label}`}
                  />
                </CardContent>
              </Card>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
