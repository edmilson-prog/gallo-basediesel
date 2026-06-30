import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Icon } from "@/components/Icon";
import {
  getActiveDataSource,
  useWhatsAppAccountsProvider,
  useWhatsAppGoServersProvider,
} from "@/providers/data";
import { useEvolutionPairing } from "../hooks/useEvolutionPairing";
import type { IWhatsAppAccount, IWhatsAppGoServer, WhatsAppAccountPurpose } from "@/shared/types";
import { isValidCredentialsRef, INVALID_CREDENTIALS_REF_MESSAGE } from "../api/whatsappConnect";
import { generateGoCredentialsRef } from "../utils/goCredentials";

type Phase = "form" | "creating" | "qr" | "done";
type WizardProvider = "evolution-go" | "evolution";

const EVOLUTION_FAMILY_CAPS: IWhatsAppAccount["capabilities"] = {
  supportsTemplatesHsm: false,
  supportsInteractiveButtons: false,
  supportsLists: false,
  supportsReactions: true,
  supportsProactiveMessaging: true,
  supportsReadStatusInGroups: true,
};

const PURPOSE_OPTIONS: Array<{ value: WhatsAppAccountPurpose; label: string }> = [
  { value: "atendimento", label: "Atendimento" },
  { value: "campanha", label: "Campanha" },
  { value: "ambos", label: "Ambos" },
];

function slugify(label: string): string {
  return label
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 24);
}

/**
 * Cria uma NOVA instância pela UI (multi-instância). Suporta Evolution Go
 * (padrão) e Evolution v2 (legado — requer instância existente). A instância é
 * criada no servidor pela ação `qr` da edge `whatsapp-connect` (idempotente) ao parear.
 */
export function AddInstanceWizard({
  storeId,
  accounts,
  onClose,
  onCreated,
}: {
  storeId: string;
  /** All accounts of the store — used to derive per-provider templates and to
   *  guarantee a unique Go credentialsRef. */
  accounts: IWhatsAppAccount[];
  onClose: () => void;
  /** Chamado ao concluir — recebe o id da nova conta (para configurar acesso). */
  onCreated: (accountId: string) => void;
}) {
  const provider = useWhatsAppAccountsProvider();
  const goServersProvider = useWhatsAppGoServersProvider();
  const [goServers, setGoServers] = useState<IWhatsAppGoServer[]>([]);
  const [goServerId, setGoServerId] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    goServersProvider
      .list()
      .then((list) => {
        if (cancelled) return;
        setGoServers(list);
        if (list.length === 1) setGoServerId(list[0]!.id); // auto-select the only one
      })
      .catch(() => {
        if (!cancelled) setGoServers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [goServersProvider]);

  const [phase, setPhase] = useState<Phase>("form");
  const [label, setLabel] = useState("");
  const [purpose, setPurpose] = useState<WhatsAppAccountPurpose>("atendimento");
  const [accountId, setAccountId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Stable suffix so the generated instance name preview doesn't jump per keystroke.
  const [suffix] = useState(() => Math.random().toString(36).slice(2, 5));
  const instanceName = useMemo(
    () => (label.trim() ? `${slugify(label) || "instancia"}-${suffix}` : ""),
    [label, suffix],
  );

  const [wizardProvider, setWizardProvider] = useState<WizardProvider>("evolution-go");

  const isMock = useMemo(() => getActiveDataSource() === "mock", []);
  const evolutionTemplate = useMemo(
    () => accounts.find((a) => a.provider === "evolution" && a.providerConfig?.baseUrl) ?? null,
    [accounts],
  );
  const existingRefs = useMemo(() => accounts.map((a) => a.credentialsRef), [accounts]);
  // Stable suffix so the generated Go credentialsRef preview is steady per keystroke.
  const [goSuffix] = useState(() => Math.random().toString(36).slice(2, 5));
  const goCredentialsRef = useMemo(
    () => (label.trim() ? generateGoCredentialsRef(label, existingRefs, goSuffix) : ""),
    [label, existingRefs, goSuffix],
  );

  const pairing = useEvolutionPairing(
    (phase === "qr" || phase === "done") && accountId ? accountId : null,
  );

  // QR scanned → connection open: advance to the success step.
  useEffect(() => {
    if (phase === "qr" && pairing.phase === "open") setPhase("done");
  }, [phase, pairing.phase]);

  async function handleCreate() {
    setError(null);
    if (wizardProvider === "evolution-go") {
      if (!goServerId) {
        setError("Selecione o servidor Evolution Go.");
        return;
      }
      if (!isMock && !isValidCredentialsRef(goCredentialsRef)) {
        setError(INVALID_CREDENTIALS_REF_MESSAGE);
        return;
      }
      setPhase("creating");
      try {
        const created = await provider.create({
          storeId,
          label: label.trim(),
          phoneNumber: "",
          provider: "evolution-go",
          credentialsRef: goCredentialsRef,
          status: "pending",
          capabilities: EVOLUTION_FAMILY_CAPS,
          providerConfig: { instanceId: "" },
          goServerId,
          currentState: "healthy",
          failoverPolicy: "disabled",
          isFailoverActive: false,
          purpose,
          alertsMuted: false,
        });
        setAccountId(created.id);
        setPhase("qr");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Falha ao criar a instância Evolution Go.");
        setPhase("form");
      }
      return;
    }

    // ----- Evolution v2 (legado) — comportamento atual -----
    if (!evolutionTemplate) return;
    setPhase("creating");
    try {
      const created = await provider.create({
        storeId,
        label: label.trim(),
        phoneNumber: "",
        provider: "evolution",
        credentialsRef: evolutionTemplate.credentialsRef,
        status: "pending",
        capabilities: EVOLUTION_FAMILY_CAPS,
        providerConfig: {
          baseUrl: evolutionTemplate.providerConfig?.baseUrl ?? "",
          instanceName,
        },
        currentState: "healthy",
        failoverPolicy: "disabled",
        isFailoverActive: false,
        purpose,
        alertsMuted: false,
      });
      setAccountId(created.id);
      setPhase("qr");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao criar a instância.");
      setPhase("form");
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Adicionar número</DialogTitle>
          <DialogDescription>
            {wizardProvider === "evolution-go"
              ? "Cria um novo número no servidor Evolution Go e conecta por QR code."
              : "Cria um novo número no servidor Evolution e conecta por QR code."}
          </DialogDescription>
        </DialogHeader>

        {phase === "form" ? (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Provedor</Label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setWizardProvider("evolution-go")}
                  className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                    wizardProvider === "evolution-go"
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Evolution Go
                </button>
                <button
                  type="button"
                  disabled={!evolutionTemplate}
                  onClick={() => setWizardProvider("evolution")}
                  title={
                    evolutionTemplate
                      ? "Cria um número no servidor Evolution v2 existente"
                      : "Conecte uma instância Evolution v2 primeiro"
                  }
                  className={`rounded-full border px-3 py-1 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                    wizardProvider === "evolution"
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Evolution v2 (legado)
                </button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="add-instance-label">Apelido da instância</Label>
              <Input
                id="add-instance-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Ex.: Comercial Volvo"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label>Finalidade</Label>
              <div className="flex flex-wrap gap-2">
                {PURPOSE_OPTIONS.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => setPurpose(p.value)}
                    className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                      purpose === p.value
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            {wizardProvider === "evolution-go" && (
              <div className="space-y-1.5">
                <Label htmlFor="add-go-server">Servidor Evolution Go</Label>
                {goServers.length === 0 ? (
                  <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                    Nenhum servidor cadastrado. Cadastre um em{" "}
                    <strong>Configurações → Integrações &amp; Chaves</strong> antes de adicionar um
                    número.
                  </div>
                ) : (
                  <select
                    id="add-go-server"
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    value={goServerId}
                    onChange={(e) => setGoServerId(e.target.value)}
                  >
                    <option value="" disabled>
                      Selecione o servidor…
                    </option>
                    {goServers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}
            <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs">
              <span className="text-muted-foreground">
                {wizardProvider === "evolution-go"
                  ? "Prefixo de credenciais (gerado): "
                  : "ID técnico (gerado): "}
              </span>
              <span className="font-mono text-foreground">
                {wizardProvider === "evolution-go" ? goCredentialsRef || "—" : instanceName || "—"}
              </span>
            </div>
            {error && <p className="text-xs text-severity-critical">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onClose}>
                Cancelar
              </Button>
              <Button
                disabled={
                  !label.trim() ||
                  (wizardProvider === "evolution-go" && (goServers.length === 0 || !goServerId))
                }
                onClick={() => void handleCreate()}
              >
                Criar e conectar
              </Button>
            </div>
          </div>
        ) : phase === "creating" ? (
          <p className="py-10 text-center text-sm text-primary">
            <Icon icon="mdi:loading" className="mr-1.5 inline animate-spin" size={16} />
            {wizardProvider === "evolution-go"
              ? "Criando a instância no servidor Evolution Go…"
              : "Criando a instância no servidor Evolution…"}
          </p>
        ) : phase === "qr" ? (
          <div className="space-y-3 py-2 text-center">
            {pairing.phase === "loading-qr" && (
              <p className="py-10 text-sm text-muted-foreground">
                <Icon icon="mdi:loading" className="mr-1.5 inline animate-spin" size={16} />
                Gerando o QR code…
              </p>
            )}
            {pairing.phase === "qr" && pairing.qrBase64 && (
              <>
                <img
                  src={pairing.qrBase64}
                  alt="QR code para conectar o WhatsApp"
                  className="mx-auto size-56 rounded-lg border border-border"
                />
                <p className="text-xs text-muted-foreground">
                  No WhatsApp do número: <strong>Aparelhos conectados → Conectar aparelho</strong>.
                  O código expira em {pairing.secondsLeft}s.
                </p>
              </>
            )}
            {pairing.phase === "connecting" && (
              <p className="py-10 text-sm text-primary">
                <Icon icon="mdi:loading" className="mr-1.5 inline animate-spin" size={16} />
                Conectando…
              </p>
            )}
            {pairing.phase === "expired" && (
              <div className="space-y-2 py-6">
                <p className="text-sm text-severity-warning">QR code expirado.</p>
                <Button variant="outline" onClick={pairing.renew}>
                  Gerar novo código
                </Button>
              </div>
            )}
            {pairing.phase === "error" && (
              <div className="space-y-2 py-6">
                <p className="text-sm text-severity-critical">
                  {pairing.errorMessage ?? "Não foi possível gerar o QR code."}
                </p>
                <Button variant="outline" onClick={pairing.renew}>
                  Tentar de novo
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4 py-6 text-center">
            <p className="text-sm font-semibold text-severity-success">
              <Icon icon="mdi:check-circle" className="mr-1.5 inline" size={18} />
              Conectado{pairing.profile.phoneNumber ? ` · ${pairing.profile.phoneNumber}` : ""}
            </p>
            <p className="text-xs text-muted-foreground">
              Defina quem acessa esta instância para que apareça nas conversas da equipe.
            </p>
            <div className="flex justify-center gap-2">
              <Button variant="outline" onClick={onClose}>
                Concluir
              </Button>
              <Button onClick={() => accountId && onCreated(accountId)}>
                Configurar quem acessa
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
