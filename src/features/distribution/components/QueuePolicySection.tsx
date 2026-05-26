import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Icon } from "@/components/Icon";
import type { IDistributionSettings } from "@/shared/types";

interface IQueuePolicySectionProps {
  settings: IDistributionSettings;
  saving: boolean;
  onChange: (patch: Partial<IDistributionSettings>) => Promise<void>;
}

export function QueuePolicySection({ settings, saving, onChange }: IQueuePolicySectionProps) {
  const [draft, setDraft] = useState<number>(settings.queueTimeoutMinutes);
  const dirty = useMemo(
    () => draft !== settings.queueTimeoutMinutes,
    [draft, settings.queueTimeoutMinutes],
  );

  const save = async () => {
    if (!Number.isFinite(draft) || draft < 1) {
      toast.error("Informe um número de minutos maior que zero.");
      return;
    }
    try {
      await onChange({ queueTimeoutMinutes: Math.round(draft) });
      toast.success("Política de fila atualizada.");
    } catch {
      toast.error("Não foi possível salvar a política.");
    }
  };

  return (
    <section aria-labelledby="queue-policy" className="space-y-3">
      <header>
        <h2 id="queue-policy" className="text-base font-semibold">
          Política de fila
        </h2>
        <p className="text-sm text-muted-foreground">
          Tempo máximo que uma conversa pode aguardar atribuição antes de gerar um alerta para o
          gestor.
        </p>
      </header>
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 p-4">
          <Icon icon="mdi:timer-sand" size={22} className="text-muted-foreground" />
          <label htmlFor="queueTimeout" className="text-sm font-medium">
            Alertar após
          </label>
          <Input
            id="queueTimeout"
            type="number"
            min={1}
            max={1440}
            value={draft}
            onChange={(e) => setDraft(Number(e.target.value))}
            className="h-9 w-24"
          />
          <span className="text-sm text-muted-foreground">minutos na fila</span>
          {dirty && (
            <div className="ml-auto flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDraft(settings.queueTimeoutMinutes)}
                disabled={saving}
              >
                Descartar
              </Button>
              <Button size="sm" onClick={() => void save()} disabled={saving}>
                Salvar política
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
