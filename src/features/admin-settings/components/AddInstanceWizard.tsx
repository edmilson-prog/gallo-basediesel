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
import { useWhatsAppAccountsProvider } from "@/providers/data";
import { useEvolutionPairing } from "../hooks/useEvolutionPairing";
import type { IWhatsAppAccount, WhatsAppAccountPurpose } from "@/shared/types";

type Phase = "form" | "creating" | "qr" | "done";

const EVOLUTION_CAPS: IWhatsAppAccount["capabilities"] = {
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
 * Cria uma NOVA instância Evolution pela UI (multi-instância). Reusa a config
 * de servidor (baseUrl + credentialsRef = mesma apikey) de uma instância
 * existente — a spec assume um único servidor Evolution. A instância é criada
 * no servidor pela ação `qr` da edge `whatsapp-connect` (idempotente) ao parear.
 */
export function AddInstanceWizard({
  storeId,
  templateAccount,
  onClose,
  onCreated,
}: {
  storeId: string;
  /** Instância Evolution existente de onde herdar baseUrl + credentialsRef. */
  templateAccount: IWhatsAppAccount | null;
  onClose: () => void;
  /** Chamado ao concluir — recebe o id da nova conta (para configurar acesso). */
  onCreated: (accountId: string) => void;
}) {
  const provider = useWhatsAppAccountsProvider();
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

  const pairing = useEvolutionPairing(
    (phase === "qr" || phase === "done") && accountId ? accountId : null,
  );

  // QR scanned → connection open: advance to the success step.
  useEffect(() => {
    if (phase === "qr" && pairing.phase === "open") setPhase("done");
  }, [phase, pairing.phase]);

  async function handleCreate() {
    if (!templateAccount) return;
    setError(null);
    setPhase("creating");
    try {
      const created = await provider.create({
        storeId,
        label: label.trim(),
        phoneNumber: "",
        provider: "evolution",
        credentialsRef: templateAccount.credentialsRef,
        status: "pending",
        capabilities: EVOLUTION_CAPS,
        providerConfig: {
          baseUrl: templateAccount.providerConfig?.baseUrl ?? "",
          instanceName,
        },
        currentState: "healthy",
        failoverPolicy: "disabled",
        isFailoverActive: false,
        purpose,
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
            Cria uma nova instância no mesmo servidor Evolution e conecta por QR code.
          </DialogDescription>
        </DialogHeader>

        {!templateAccount ? (
          <div className="rounded-lg border border-severity-warning/40 bg-severity-warning/10 p-4 text-sm text-severity-warning">
            Conecte ao menos uma instância Evolution antes de adicionar números — o servidor e a
            chave são herdados de uma instância existente.
          </div>
        ) : phase === "form" ? (
          <div className="space-y-4">
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
            <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs">
              <span className="text-muted-foreground">ID técnico (gerado): </span>
              <span className="font-mono text-foreground">{instanceName || "—"}</span>
            </div>
            {error && <p className="text-xs text-severity-critical">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onClose}>
                Cancelar
              </Button>
              <Button disabled={!label.trim()} onClick={() => void handleCreate()}>
                Criar e conectar
              </Button>
            </div>
          </div>
        ) : phase === "creating" ? (
          <p className="py-10 text-center text-sm text-primary">
            <Icon icon="mdi:loading" className="mr-1.5 inline animate-spin" size={16} />
            Criando a instância no servidor Evolution…
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
              <Button onClick={() => accountId && onCreated(accountId)}>Configurar quem acessa</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
