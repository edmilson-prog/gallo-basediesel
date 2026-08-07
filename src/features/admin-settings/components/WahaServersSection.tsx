import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useWahaServersProvider } from "@/providers/data";
import type { IWahaServer } from "@/shared/types";
import { setIntegrationSecret, deleteIntegrationSecret } from "../api/integrationSecrets";
import { invokeWaha, WahaConnectError } from "../api/wahaConnect";

/**
 * Generates a unique, env-style Vault secret name for a WAHA server's global
 * API key or webhook HMAC secret. Must match `^[A-Z][A-Z0-9_]{2,64}$` (the
 * naming rule enforced by the `integration-secrets` Edge Function). Pure: the
 * random suffix is injected by the caller so the result is deterministic.
 */
function slugUpper(name: string): string {
  const slug = name
    .toUpperCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 24);
  return slug || "SERVIDOR";
}

function generateWahaServerRef(
  name: string,
  suffix: string,
  existingRefs: string[],
  kind: "key" | "hmac",
): string {
  const suf =
    suffix
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 16) || "X";
  const base =
    kind === "hmac"
      ? `WAHA_SERVER_${slugUpper(name)}_HMAC_${suf}`
      : `WAHA_SERVER_${slugUpper(name)}_${suf}`;
  let candidate = base;
  let n = 1;
  while (existingRefs.includes(candidate)) {
    candidate = `${base}_${n++}`;
  }
  return candidate;
}

/**
 * Owner-only CRUD of WAHA servers (Integrações & Chaves). The global API key
 * and the webhook HMAC secret are written to the Vault here (via
 * integration-secrets); the table stores only the pointers. Rotating
 * re-saves the same secret name — instant, no redeploy. Deleting is guarded
 * by the FK (a server with linked sessions fails).
 */
export function WahaServersSection({ canEdit }: { canEdit: boolean }) {
  const provider = useWahaServersProvider();
  const [servers, setServers] = useState<IWahaServer[]>([]);
  const [adding, setAdding] = useState(false);
  const reload = () =>
    provider
      .list()
      .then(setServers)
      .catch(() => setServers([]));

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider]);

  const existingRefs = useMemo(
    () =>
      servers.flatMap((s) =>
        [s.apiKeyRef, s.webhookHmacRef].filter((v): v is string => Boolean(v)),
      ),
    [servers],
  );

  return (
    <section className="rounded-lg border border-border bg-card">
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex items-center gap-3">
          <Icon icon="mdi:server-network" className="size-5 text-muted-foreground" />
          <div>
            <h2 className="text-sm font-semibold">Servidor WAHA</h2>
            <p className="text-xs text-muted-foreground">
              Cadastre o servidor uma vez (nome · endpoint · chave global · HMAC do webhook). As
              sessões escolhem o servidor — sem digitar a chave de novo.
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
          <WahaServerForm
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
          <WahaServerRow
            key={s.id}
            server={s}
            canEdit={canEdit}
            existingRefs={existingRefs}
            onChanged={reload}
          />
        ))}
      </div>
    </section>
  );
}

function WahaServerForm({
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
  const provider = useWahaServersProvider();
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [hmacKey, setHmacKey] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const n = name.trim();
    const url = baseUrl.trim().replace(/\/+$/, "");
    const key = apiKey.trim();
    const hmac = hmacKey.trim();
    if (!n || !url || !key) {
      toast.error("Preencha nome, endpoint e chave global.");
      return;
    }
    setSaving(true);
    try {
      const suffix = crypto.randomUUID().slice(0, 3);
      const apiKeyRef = generateWahaServerRef(n, suffix, existingRefs, "key");
      await setIntegrationSecret(apiKeyRef, key, `Chave global WAHA — ${n}`);

      let webhookHmacRef: string | undefined;
      if (hmac) {
        webhookHmacRef = generateWahaServerRef(n, suffix, [...existingRefs, apiKeyRef], "hmac");
        await setIntegrationSecret(webhookHmacRef, hmac, `HMAC do webhook WAHA — ${n}`);
      }

      const created = await provider.create({ name: n, baseUrl: url, apiKeyRef });
      if (webhookHmacRef) {
        await provider.setWebhookHmacRef(created.id, webhookHmacRef);
      }
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
          <Label htmlFor="waha-server-name">Nome amigável</Label>
          <Input
            id="waha-server-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex.: WAHA Principal"
            disabled={!canEdit || saving}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="waha-server-url">Endpoint</Label>
          <Input
            id="waha-server-url"
            className="font-mono"
            inputMode="url"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://waha.seudominio.com"
            disabled={!canEdit || saving}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="waha-server-key">Chave global da API</Label>
        <Input
          id="waha-server-key"
          type="password"
          autoComplete="new-password"
          className="max-w-md font-mono"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="Chave global do servidor (X-Api-Key)"
          disabled={!canEdit || saving}
        />
        <p className="text-[11px] text-muted-foreground">
          Gravada criptografada no cofre — nunca exibida de volta. Vale para todas as sessões deste
          servidor.
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="waha-server-hmac">HMAC do webhook (opcional)</Label>
        <Input
          id="waha-server-hmac"
          type="password"
          autoComplete="new-password"
          className="max-w-md font-mono"
          value={hmacKey}
          onChange={(e) => setHmacKey(e.target.value)}
          placeholder="Segredo usado para assinar os webhooks"
          disabled={!canEdit || saving}
        />
        {hmacKey.trim() ? (
          <p className="text-[11px] text-muted-foreground">
            Gravado criptografado no cofre — nunca exibido de volta.
          </p>
        ) : (
          <p className="text-[11px] text-severity-warning">
            Sem HMAC, sessões não poderão ser criadas até o HMAC ser definido — você pode
            adicioná-lo depois.
          </p>
        )}
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

function WahaServerRow({
  server,
  canEdit,
  existingRefs,
  onChanged,
}: {
  server: IWahaServer;
  canEdit: boolean;
  existingRefs: string[];
  onChanged: () => void | Promise<void>;
}) {
  const provider = useWahaServersProvider();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(server.name);
  const [baseUrl, setBaseUrl] = useState(server.baseUrl);
  const [rotatingKey, setRotatingKey] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [rotatingHmac, setRotatingHmac] = useState(false);
  const [newHmac, setNewHmac] = useState("");
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [lastTest, setLastTest] = useState<{ ok: boolean; label: string; at: Date } | null>(null);

  const handleTestConnection = async () => {
    setTesting(true);
    try {
      const result = await invokeWaha<{ sessionCount: number }>({
        wahaServerId: server.id,
        action: "ping",
      });
      const label = `Conectado — ${result.sessionCount} sessão(ões) no servidor`;
      setLastTest({ ok: true, label, at: new Date() });
      toast.success(label);
    } catch (err) {
      const message =
        err instanceof WahaConnectError ? err.message : "Não foi possível conectar ao servidor.";
      setLastTest({ ok: false, label: message, at: new Date() });
      toast.error(message);
    } finally {
      setTesting(false);
    }
  };

  const handleSaveEdit = async () => {
    const n = name.trim();
    const url = baseUrl.trim().replace(/\/+$/, "");
    if (!n || !url) {
      toast.error("Preencha nome e endpoint.");
      return;
    }
    setBusy(true);
    try {
      await provider.update(server.id, { name: n, baseUrl: url });
      toast.success("Servidor atualizado.");
      setEditing(false);
      await onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível atualizar o servidor.");
    } finally {
      setBusy(false);
    }
  };

  const handleRotateKey = async () => {
    const key = newKey.trim();
    if (!key) {
      toast.error("Informe a nova chave.");
      return;
    }
    setBusy(true);
    try {
      await setIntegrationSecret(server.apiKeyRef, key, `Chave global WAHA — ${server.name}`);
      toast.success("Chave rotacionada. Vale imediatamente, sem redeploy.");
      setRotatingKey(false);
      setNewKey("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível rotacionar a chave.");
    } finally {
      setBusy(false);
    }
  };

  const handleRotateHmac = async () => {
    const hmac = newHmac.trim();
    if (!hmac) {
      toast.error("Informe o novo HMAC.");
      return;
    }
    setBusy(true);
    try {
      const hmacRef =
        server.webhookHmacRef ??
        generateWahaServerRef(server.name, crypto.randomUUID().slice(0, 3), existingRefs, "hmac");
      await setIntegrationSecret(hmacRef, hmac, `HMAC do webhook WAHA — ${server.name}`);
      if (!server.webhookHmacRef) {
        await provider.setWebhookHmacRef(server.id, hmacRef);
      }
      toast.success("HMAC do webhook rotacionado. Vale imediatamente, sem redeploy.");
      setRotatingHmac(false);
      setNewHmac("");
      await onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível rotacionar o HMAC.");
    } finally {
      setBusy(false);
    }
  };

  const handleClearHmac = async () => {
    setBusy(true);
    try {
      const ref = server.webhookHmacRef;
      await provider.setWebhookHmacRef(server.id, null);
      if (ref) {
        await deleteIntegrationSecret(ref).catch(() => {
          /* secret cleanup is best-effort; the pointer is already cleared */
        });
      }
      toast.success("HMAC do webhook removido.");
      await onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível remover o HMAC.");
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
      if (server.webhookHmacRef) {
        await deleteIntegrationSecret(server.webhookHmacRef).catch(() => {
          /* secret cleanup is best-effort; the row is already gone */
        });
      }
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
          {editing ? (
            <div className="grid max-w-xl gap-2 sm:grid-cols-2">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={busy}
                className="text-sm"
              />
              <Input
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                disabled={busy}
                className="font-mono text-sm"
              />
            </div>
          ) : (
            <>
              <p className="text-sm font-medium">{server.name}</p>
              <p className="font-mono text-[11px] text-muted-foreground">{server.baseUrl}</p>
            </>
          )}
          <p className="font-mono text-[11px] text-muted-foreground">
            ••••{server.apiKeyRef.slice(-6)}
          </p>
          <p className="font-mono text-[11px] text-muted-foreground">
            HMAC:{" "}
            {server.webhookHmacRef ? `••••${server.webhookHmacRef.slice(-6)}` : "não definido"}
          </p>
          {lastTest && (
            <p
              className={`text-[11px] ${lastTest.ok ? "text-severity-success" : "text-severity-critical"}`}
            >
              {lastTest.ok ? "✓" : "✗"} {lastTest.label} — {lastTest.at.toLocaleTimeString("pt-BR")}
            </p>
          )}
        </div>
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            {editing ? (
              <>
                <Button size="sm" onClick={handleSaveEdit} disabled={busy}>
                  {busy ? "Salvando…" : "Salvar"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setEditing(false);
                    setName(server.name);
                    setBaseUrl(server.baseUrl);
                  }}
                  disabled={busy}
                >
                  Cancelar
                </Button>
              </>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setEditing(true)} disabled={busy}>
                <Icon icon="mdi:pencil-outline" className="mr-1 size-4" />
                Editar
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleTestConnection}
              disabled={busy || testing}
            >
              <Icon
                icon={testing ? "mdi:loading" : "mdi:connection"}
                className={`mr-1 size-4 ${testing ? "animate-spin" : ""}`}
              />
              {testing ? "Testando…" : "Testar conexão"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRotatingKey((v) => !v)}
              disabled={busy}
            >
              <Icon icon="mdi:key-change" className="mr-1 size-4" />
              Rotacionar chave
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRotatingHmac((v) => !v)}
              disabled={busy}
            >
              <Icon icon="mdi:webhook" className="mr-1 size-4" />
              Rotacionar HMAC do webhook
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
      {rotatingKey && (
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
          <Button size="sm" onClick={handleRotateKey} disabled={busy}>
            {busy ? "Salvando…" : "Salvar nova chave"}
          </Button>
        </div>
      )}
      {rotatingHmac && (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="password"
            autoComplete="new-password"
            placeholder="Novo HMAC do webhook"
            value={newHmac}
            onChange={(e) => setNewHmac(e.target.value)}
            className="max-w-md font-mono"
            disabled={busy}
          />
          <Button size="sm" onClick={handleRotateHmac} disabled={busy}>
            {busy ? "Salvando…" : "Salvar novo HMAC"}
          </Button>
          {server.webhookHmacRef && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearHmac}
              disabled={busy}
              className="text-severity-critical"
            >
              Remover HMAC
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
