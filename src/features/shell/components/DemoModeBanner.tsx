import { Link } from "@tanstack/react-router";
import { Icon } from "@/components/Icon";
import { getActiveDataSource } from "@/providers/data";
import { useAuth } from "@/features/auth/useAuth";

/**
 * Thin persistent strip shown while the DATA source is the demo dataset —
 * the one state that is dangerous to forget (e.g. registering a "real"
 * customer that is silently discarded). Production (supabase) shows nothing.
 *
 * Sibling of DataSourceBanner (transient failures); this one is steady
 * context, hence role="status" + aria-live="polite" instead of an alert.
 * The management link only renders for Owners (the route is Owner-only).
 */
export function DemoModeBanner() {
  const { userRole } = useAuth();
  if (getActiveDataSource() !== "mock") return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-3 border-b border-severity-info/30 bg-severity-info/10 px-4 py-1.5 text-xs text-severity-info"
    >
      <Icon icon="mdi:flask-outline" size={14} className="shrink-0" />
      <p className="min-w-0 flex-1">
        <span className="font-semibold">Modo Demonstração ativo</span>
        <span className="opacity-80"> — os dados são fictícios e nada é salvo de verdade.</span>
      </p>
      {userRole === "Owner" && (
        <Link
          to="/app/configuracoes/ambiente"
          className="shrink-0 font-medium underline-offset-4 hover:underline"
        >
          Gerenciar ambiente
        </Link>
      )}
    </div>
  );
}
