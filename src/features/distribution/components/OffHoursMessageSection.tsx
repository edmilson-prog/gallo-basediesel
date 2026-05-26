import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Icon } from "@/components/Icon";
import type { IDistributionSettings } from "@/shared/types";

interface IOffHoursMessageSectionProps {
  settings: IDistributionSettings;
  saving: boolean;
  onChange: (patch: Partial<IDistributionSettings>) => Promise<void>;
}

const MAX_LENGTH = 600;

export function OffHoursMessageSection({
  settings,
  saving,
  onChange,
}: IOffHoursMessageSectionProps) {
  const [draft, setDraft] = useState(settings.offHoursMessage);
  const dirty = useMemo(
    () => draft.trim() !== settings.offHoursMessage.trim(),
    [draft, settings.offHoursMessage],
  );

  const save = async () => {
    if (draft.trim().length === 0) {
      toast.error("A mensagem fora do expediente não pode ficar vazia.");
      return;
    }
    try {
      await onChange({ offHoursMessage: draft.trim() });
      toast.success("Mensagem de fora do expediente atualizada.");
    } catch {
      toast.error("Não foi possível salvar a mensagem.");
    }
  };

  return (
    <section aria-labelledby="off-hours-message" className="space-y-3">
      <header className="flex items-baseline justify-between gap-2">
        <div>
          <h2 id="off-hours-message" className="text-base font-semibold">
            Mensagem de fora do expediente
          </h2>
          <p className="text-sm text-muted-foreground">
            Enviada automaticamente pelo SDR como primeira resposta quando o cliente escreve fora do
            horário comercial.
          </p>
        </div>
        {dirty && (
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDraft(settings.offHoursMessage)}
              disabled={saving}
            >
              Descartar
            </Button>
            <Button size="sm" onClick={() => void save()} disabled={saving}>
              Salvar mensagem
            </Button>
          </div>
        )}
      </header>

      <div className="grid gap-3 md:grid-cols-2">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, MAX_LENGTH))}
          rows={6}
          aria-label="Mensagem fora do expediente"
        />
        <Card>
          <CardContent className="space-y-2 p-4">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <Icon icon="mdi:eye-outline" size={14} />
              Pré-visualização
            </div>
            <div className="rounded-lg bg-primary/10 px-3 py-2 text-sm leading-relaxed text-foreground">
              {draft || (
                <span className="italic text-muted-foreground">
                  A mensagem aparecerá aqui assim que você digitar.
                </span>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              {draft.length}/{MAX_LENGTH} caracteres
            </p>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
