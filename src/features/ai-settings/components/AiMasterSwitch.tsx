import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { useAiProvider } from "@/providers/data";
import { AI_STRINGS } from "../i18n/pt-BR";

export function AiMasterSwitch({
  enabled,
  onChanged,
}: {
  enabled: boolean;
  onChanged: () => void;
}) {
  const provider = useAiProvider();
  const toggle = async (v: boolean) => {
    try {
      await provider.setMasterEnabled(v);
      onChanged();
      toast.success(v ? "IA ativada." : "IA desativada.");
    } catch {
      toast.error("Falha ao alterar o estado da IA.");
    }
  };
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs ${
        enabled ? "bg-severity-success/10 text-severity-success" : "bg-muted text-muted-foreground"
      }`}
    >
      {enabled ? AI_STRINGS.masterOn : AI_STRINGS.masterOff}
      <Switch checked={enabled} onCheckedChange={toggle} aria-label="Ativar IA globalmente" />
    </span>
  );
}
