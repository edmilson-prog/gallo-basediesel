import { createFileRoute } from "@tanstack/react-router";
import { requireAuth } from "@/features/auth/guards";
import { EscalationMetricsCard } from "@/features/sdr-escalation";

function PainelSdrPage() {
  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Painel do agente SDR</h1>
        <p className="text-sm text-muted-foreground">
          Visibilidade dos atendimentos automáticos e dos handoffs para vendedores humanos
          (PRD-023). Painel completo do SDR chega no PRD-024.
        </p>
      </div>
      <EscalationMetricsCard />
    </div>
  );
}

export const Route = createFileRoute("/app/sdr")({
  beforeLoad: ({ location }) => requireAuth(location.pathname, ["Owner"]),
  component: PainelSdrPage,
});
