import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useWhatsAppGoServersProvider } from "@/providers/data";
import type { IWhatsAppGoServer } from "@/shared/types";
import { generateGoServerKeyRef } from "../engine/goServerKeyRef";
import { setIntegrationSecret, deleteIntegrationSecret } from "../api/integrationSecrets";

/**
 * Owner-only CRUD of Evolution Go servers (Integrações & Chaves). The global key
 * is written ONCE to the Vault here (via integration-secrets); the table stores
 * only the pointer. Rotating re-saves the same api_key_ref — instant, no
 * redeploy. Deleting is guarded by the FK (a server with linked numbers fails).
 */
export function GoServersSection({ canEdit }: { canEdit: boolean }) {
  const provider = useWhatsAppGoServersProvider();
  const [servers, setServers] = useState<IWhatsAppGoServer[]>([]);
  const [adding, setAdding] = useState(false);
  const reload = () => provider.list().then(setServers).catch(() => setServers([]));

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider]);

  const existingRefs = useMemo(() => servers.map((s) => s.apiKeyRef), [servers]);

  return (
    <section className="rounded-lg border border-border bg-card">
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex items-center gap-3">
          <Icon icon="mdi:server-network" className="size-5 text-muted-foreground" />
          <div>
            <h2 className="text-sm font-semibold">Servidores Evolution Go</h2>
            <p className="text-xs text-muted-foreground">
              Cadastre o servidor uma vez (nome · endpoint · chave global). Os números escolhem o
              servidor — sem digitar a chave de novo.
            </p>
          </div>
        </div>
        {canEdit && !adding && (
          <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
            <Icon icon="mdi:plus" className="mr-1 size-4" />
            Adicionar
          </Button>
        )}
      </header>

      <div className="divide-y divide-border">
        {adding && (
          <GoServerForm
            canEdit={canEdit}
            existingRefs={existingRefs}
            onCancel={() => setAdding(false)}
            onSaved={async () => {
              setAdding(false);
              await reload();
            }}
          />
        )}
        {servers.length === 0 && !adding && (
          <p className="px-4 py-6 text-sm text-muted-foreground">Nenhum servidor cadastrado.</p>
        )}
        {servers.map((s) => (
          <GoServerRow key={s.id} server={s} canEdit={canEdit} onChanged={reload} />
        ))}
      </div>
    </section>
  );
}

function GoServerForm({
  canEdit,
  existingRefs,
  onCancel,
  onSaved,
}: {
  canEdit: boolean;
  existingRefs: string[];
  onCancel: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const provider = useWhatsAppGoServersProvider();
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const n = name.trim();
    const url = baseUrl.trim().replace(/\/+$/, "");
    const key = apiKey.trim();
    if (!n || !url || !key) {
      toast.error("Preencha nome, endpoint e chave global.");
      return;
    }
    setSaving(true);
    try {
      const suffix = crypto.randomUUID().slice(0, 3);
      const apiKeyRef = generateGoServerKeyRef(n, existingRefs, suffix);
      await setIntegrationSecret(apiKeyRef, key, `Chave global Evolution Go — ${n}`);
      await provider.create({ name: n, baseUrl: url, apiKeyRef });
      toast.success("Servidor cadastrado com segurança.");
      await onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível salvar o servidor.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3 px-4 py-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="go-server-name">Nome amigável</Label>
          <Input
            id="go-server-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex.: AILA Go Principal"
            disabled={!canEdit || saving}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="go-server-url">Endpoint</Label>
          <Input
            id="go-server-url"
            className="font-mono"
            inputMode="url"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://evogo.seudominio.com"
            disabled={!canEdit || saving}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="go-server-key">Chave global da API</Label>
        <Input
          id="go-server-key"
          type="password"
          autoComplete="new-password"
          className="max-w-md font-mono"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="Chave global do servidor (admin)"
          disabled={!canEdit || saving}
        />
        <p className="text-[11px] text-muted-foreground">
          Gravada criptografada no cofre — nunca exibida de volta. Vale para todos os números deste
          servidor.
        </p>
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={handleSave} disabled={!canEdit || saving}>
          {saving ? "Salvando…" : "Salvar servidor"}
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}

function GoServerRow({
  server,
  canEdit,
  onChanged,
}: {
  server: IWhatsAppGoServer;
  canEdit: boolean;
  onChanged: () => void | Promise<void>;
}) {
  const provider = useWhatsAppGoServersProvider();
  const [rotating, setRotating] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [busy, setBusy] = useState(false);

  const handleRotate = async () => {
    const key = newKey.trim();
    if (!key) {
      toast.error("Informe a nova chave.");
      return;
    }
    setBusy(true);
    try {
      await setIntegrationSecret(
        server.apiKeyRef,
        key,
        `Chave global Evolution Go — ${server.name}`,
      );
      toast.success("Chave rotacionada. Vale imediatamente, sem redeploy.");
      setRotating(false);
      setNewKey("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível rotacionar a chave.");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    setBusy(true);
    try {
      await provider.remove(server.id); // FK guard throws a friendly message if linked
      await deleteIntegrationSecret(server.apiKeyRef).catch(() => {
        /* secret cleanup is best-effort; the row is already gone */
      });
      toast.success("Servidor removido.");
      await onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível remover o servidor.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium">{server.name}</p>
          <p className="font-mono text-[11px] text-muted-foreground">{server.baseUrl}</p>
          <p className="font-mono text-[11px] text-muted-foreground">
            ••••{server.apiKeyRef.slice(-6)}
          </p>
        </div>
        {canEdit && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRotating((v) => !v)}
              disabled={busy}
            >
              <Icon icon="mdi:key-change" className="mr-1 size-4" />
              Rotacionar chave
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDelete}
              disabled={busy}
              className="text-severity-critical"
            >
              <Icon icon="mdi:trash-can-outline" className="size-4" />
            </Button>
          </div>
        )}
      </div>
      {rotating && (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="password"
            autoComplete="new-password"
            placeholder="Nova chave global"
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            className="max-w-md font-mono"
            disabled={busy}
          />
          <Button size="sm" onClick={handleRotate} disabled={busy}>
            {busy ? "Salvando…" : "Salvar nova chave"}
          </Button>
        </div>
      )}
    </div>
  );
}
