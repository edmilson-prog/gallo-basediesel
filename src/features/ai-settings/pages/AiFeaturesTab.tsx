import { Link } from "@tanstack/react-router";
import { Icon } from "@/components/Icon";
import { Skeleton } from "@/components/ui/skeleton";
import { useAiSettings } from "../hooks/useAiSettings";
import { FeatureRoutingRow } from "../components/FeatureRoutingRow";

export function AiFeaturesTab() {
  const { settings, loading, reload } = useAiSettings();
  if (loading || !settings) return <Skeleton className="h-96 w-full" />;

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
        <Icon icon="mdi:directions-fork" className="mt-0.5 size-4 shrink-0 text-primary" />
        <span>
          Cada funcionalidade roteia para o provedor/modelo escolhido. Se ele estiver indisponível,
          cai para o fallback definido.
        </span>
      </div>
      {settings.routing.map((r) => (
        <div key={r.feature}>
          <FeatureRoutingRow route={r} providers={settings.providers} onChanged={reload} />
          {r.feature === "sdr" && (
            <p className="mt-1 pl-1 text-xs text-muted-foreground">
              Liga o piloto e escolhe as instâncias em{" "}
              <Link to="/app/sdr" className="underline underline-offset-2">
                Configurações → SDR
              </Link>
              .
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
