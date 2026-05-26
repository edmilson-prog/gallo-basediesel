import { createFileRoute } from "@tanstack/react-router";
import { requireAuth } from "@/features/auth/guards";
import { SdrDashboardPage } from "@/features/sdr-dashboard";

interface ISdrSearch {
  periodo?: string;
  de?: string;
  ate?: string;
  loja?: string;
  estado?: string;
  motivo?: string;
  vendedor?: string;
  quote?: string;
  pagina?: string;
}

function isString(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}

export const Route = createFileRoute("/app/sdr")({
  beforeLoad: ({ location }) => requireAuth(location.pathname, ["Owner", "Gestor"]),
  validateSearch: (raw: Record<string, unknown>): ISdrSearch => {
    const out: ISdrSearch = {};
    if (isString(raw.periodo)) out.periodo = raw.periodo;
    if (isString(raw.de)) out.de = raw.de;
    if (isString(raw.ate)) out.ate = raw.ate;
    if (isString(raw.loja)) out.loja = raw.loja;
    if (isString(raw.estado)) out.estado = raw.estado;
    if (isString(raw.motivo)) out.motivo = raw.motivo;
    if (isString(raw.vendedor)) out.vendedor = raw.vendedor;
    if (isString(raw.quote)) out.quote = raw.quote;
    if (isString(raw.pagina)) out.pagina = raw.pagina;
    return out;
  },
  component: SdrDashboardPage,
});
