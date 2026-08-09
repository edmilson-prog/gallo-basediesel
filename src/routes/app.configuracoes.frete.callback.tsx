import { useEffect, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Icon } from "@/components/Icon";
import { SettingsLayout } from "@/features/shell/layouts";
import { requireAuth } from "@/features/auth/guards";
import {
  exchangeMelhorEnvioCode,
  MELHOR_ENVIO_OAUTH_ENV_KEY,
  MELHOR_ENVIO_OAUTH_STATE_KEY,
  type MelhorEnvioEnv,
} from "@/features/shipping/api/melhorEnvioOAuth";

interface CallbackSearch {
  code?: string;
  state?: string;
  error?: string;
}

export const Route = createFileRoute("/app/configuracoes/frete/callback")({
  validateSearch: (search: Record<string, unknown>): CallbackSearch => ({
    code: typeof search.code === "string" ? search.code : undefined,
    state: typeof search.state === "string" ? search.state : undefined,
    error: typeof search.error === "string" ? search.error : undefined,
  }),
  beforeLoad: ({ location }) =>
    requireAuth(location.pathname, undefined, { resource: "settings", action: "edit" }),
  component: MelhorEnvioCallback,
});

/**
 * OAuth2 redirect target for the Melhor Envio connection (Fase A).
 * Validates the CSRF `state` against sessionStorage, exchanges the `code` for
 * tokens (server-side) and returns to the freight settings screen.
 */
function MelhorEnvioCallback() {
  const navigate = useNavigate();
  const { code, state, error } = Route.useSearch();
  const [message, setMessage] = useState("Concluindo conexão com o Melhor Envio…");
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const goBack = () => void navigate({ to: "/app/configuracoes/frete" });

    // localStorage (shared per-origin across tabs), not sessionStorage (per-tab):
    // the Melhor Envio consent can return on a different tab than the one that
    // started the flow, and a per-tab store would lose the CSRF state there.
    const expectedState = localStorage.getItem(MELHOR_ENVIO_OAUTH_STATE_KEY);
    const env = (localStorage.getItem(MELHOR_ENVIO_OAUTH_ENV_KEY) as MelhorEnvioEnv) ?? "sandbox";
    localStorage.removeItem(MELHOR_ENVIO_OAUTH_STATE_KEY);
    localStorage.removeItem(MELHOR_ENVIO_OAUTH_ENV_KEY);

    if (error) {
      toast.error("Conexão cancelada ou negada pelo Melhor Envio.");
      setMessage("Conexão não concluída.");
      goBack();
      return;
    }
    if (!code || !state) {
      toast.error("Resposta inválida do Melhor Envio (faltam code/state).");
      goBack();
      return;
    }
    if (!expectedState || expectedState !== state) {
      toast.error("Falha de segurança (state divergente). Tente conectar novamente.");
      goBack();
      return;
    }

    void (async () => {
      try {
        await exchangeMelhorEnvioCode(code, env);
        toast.success("Melhor Envio conectado com sucesso.");
      } catch {
        toast.error("Não foi possível concluir a conexão com o Melhor Envio.");
      } finally {
        goBack();
      }
    })();
  }, [code, state, error, navigate]);

  return (
    <SettingsLayout>
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
        <Icon icon="mdi:loading" className="size-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
    </SettingsLayout>
  );
}
