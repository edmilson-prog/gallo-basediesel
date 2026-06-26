import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Icon } from "@/components/Icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrentStore } from "@/features/multistore";
import { getActiveDataSource, useWhatsAppAccountsProvider } from "@/providers/data";
import type { IWhatsAppAccount } from "@/shared/types";
import {
  listIntegrationSecrets,
  setIntegrationSecret,
  type IIntegrationSecretStatus,
} from "../api/integrationSecrets";
import {
  buildIntegrationKeyCatalog,
  type IIntegrationKeyDef,
  type IIntegrationKeyGroup,
} from "../engine/integrationKeys";
import { GoServersSection } from "../components/GoServersSection";
import { SectionHeader } from "../components/SectionHeader";

const DATE_FORMAT = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
});

function formatUpdatedAt(iso?: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : DATE_FORMAT.format(date);
}

/**
 * Owner-only management of third-party API keys ("Integrações & Chaves").
 *
 * WRITE-ONLY by design: a value is pasted, travels once over HTTPS to the
 * `integration-secrets` Edge Function and is stored ENCRYPTED in Supabase
 * Vault — the screen never shows it back (only "configurada em <data>" and a
 * 4-char hint). Runtime functions resolve Vault-first with env fallback, so
 * rotating a key here takes effect without redeploys.
 */
export function IntegrationKeysPage() {
  const { currentStoreId } = useCurrentStore();
  const storeId = currentStoreId ?? "00000000-0000-0000-0000-000000000001";
  const accountsProvider = useWhatsAppAccountsProvider();
  const isSupabase = useMemo(() => getActiveDataSource() === "supabase", []);

  const [accounts, setAccounts] = useState<IWhatsAppAccount[]>([]);
  const [statuses, setStatuses] = useState<IIntegrationSecretStatus[] | null>(
    isSupabase ? null : [],
  );
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    accountsProvider
      .list({ storeId })
      .then((list) => {
        if (!cancelled) setAccounts(list);
      })
      .catch(() => {
        if (!cancelled) setAccounts([]);
      });
    return () => {
      cancelled = true;
    };
  }, [accountsProvider, storeId]);

  useEffect(() => {
    if (!isSupabase) return;
    let cancelled = false;
    listIntegrationSecrets()
      .then((list) => {
        if (!cancelled) setStatuses(list);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setStatuses([]);
          setLoadError(err instanceof Error ? err.message : "Falha ao carregar as chaves.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isSupabase]);

  const groups = useMemo(() => buildIntegrationKeyCatalog(accounts), [accounts]);
  const statusByName = useMemo(() => {
    const map = new Map<string, IIntegrationSecretStatus>();
    for (const status of statuses ?? []) map.set(status.name, status);
    return map;
  }, [statuses]);

  const handleSaved = (name: string, hint: string) => {
    setStatuses((prev) => {
      const next = (prev ?? []).filter((status) => status.name !== name);
      next.push({ name, hint, updatedAt: new Date().toISOString() });
      return next;
    });
  };

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Integrações & Chaves"
        description="Chaves de API e parâmetros das integrações, guardados criptografados no cofre da plataforma."
      />

      <GoServersSection canEdit={isSupabase} />

      <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
        <Icon icon="mdi:shield-lock-outline" className="mt-0.5 size-4 shrink-0" />
        <p>
          As chaves são <strong>gravadas de forma criptografada</strong> e nunca são exibidas de
          volta — a tela mostra apenas quando cada uma foi configurada e os 4 últimos caracteres,
          para reconhecimento. Substituir uma chave entra em vigor imediatamente, sem redeploy.
        </p>
      </div>

      {!isSupabase && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-700 dark:text-amber-300">
          <Icon icon="mdi:information-outline" className="mt-0.5 size-4 shrink-0" />
          <p>
            O gerenciamento de chaves fica disponível no <strong>modo Supabase</strong>. No modo
            demonstração esta tela apenas apresenta o catálogo de chaves esperadas.
          </p>
        </div>
      )}

      {loadError && (
        <div className="flex items-start gap-3 rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-700 dark:text-red-300">
          <Icon icon="mdi:alert-circle-outline" className="mt-0.5 size-4 shrink-0" />
          <p>{loadError}</p>
        </div>
      )}

      {isSupabase && statuses === null ? (
        <div className="space-y-4">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : (
        groups.map((group) => (
          <KeyGroupCard
            key={group.id}
            group={group}
            statusByName={statusByName}
            canEdit={isSupabase}
            onSaved={handleSaved}
          />
        ))
      )}
    </div>
  );
}

function KeyGroupCard({
  group,
  statusByName,
  canEdit,
  onSaved,
}: {
  group: IIntegrationKeyGroup;
  statusByName: Map<string, IIntegrationSecretStatus>;
  canEdit: boolean;
  onSaved: (name: string, hint: string) => void;
}) {
  return (
    <section className="rounded-lg border border-border bg-card">
      <header className="flex items-center gap-3 border-b border-border px-4 py-3">
        <Icon icon={group.icon} className="size-5 text-muted-foreground" />
        <div>
          <h2 className="text-sm font-semibold">{group.title}</h2>
          {group.description && (
            <p className="text-xs text-muted-foreground">{group.description}</p>
          )}
        </div>
      </header>
      <div className="divide-y divide-border">
        {group.keys.map((keyDef) => (
          <KeyRow
            key={keyDef.name}
            keyDef={keyDef}
            status={statusByName.get(keyDef.name)}
            canEdit={canEdit}
            onSaved={onSaved}
          />
        ))}
      </div>
    </section>
  );
}

function KeyRow({
  keyDef,
  status,
  canEdit,
  onSaved,
}: {
  keyDef: IIntegrationKeyDef;
  status?: IIntegrationSecretStatus;
  canEdit: boolean;
  onSaved: (name: string, hint: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);

  const configured = Boolean(status);
  const updatedAt = formatUpdatedAt(status?.updatedAt);

  const handleSave = async () => {
    const trimmed = value.trim();
    if (!trimmed) {
      toast.error("Informe o valor da chave.");
      return;
    }
    setSaving(true);
    try {
      await setIntegrationSecret(keyDef.name, trimmed, keyDef.label);
      onSaved(keyDef.name, trimmed.slice(-4));
      setEditing(false);
      setValue("");
      toast.success(`${keyDef.label} salva com segurança.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível salvar a chave.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{keyDef.label}</span>
            {configured ? (
              <Badge
                variant="outline"
                className="border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
              >
                <Icon icon="mdi:check-circle-outline" className="mr-1 size-3" />
                Configurada
                {status?.hint ? ` · ••••${status.hint}` : ""}
              </Badge>
            ) : (
              <Badge variant="outline" className="text-muted-foreground">
                Não configurada
              </Badge>
            )}
          </div>
          <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">{keyDef.name}</p>
          {keyDef.help && <p className="mt-0.5 text-xs text-muted-foreground">{keyDef.help}</p>}
          {configured && updatedAt && (
            <p className="mt-0.5 text-xs text-muted-foreground">Atualizada em {updatedAt}.</p>
          )}
        </div>
        {!editing && (
          <Button variant="outline" size="sm" disabled={!canEdit} onClick={() => setEditing(true)}>
            <Icon icon="mdi:key-plus" className="mr-1 size-4" />
            {configured ? "Substituir" : "Definir"}
          </Button>
        )}
      </div>

      {editing && (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="password"
            autoComplete="off"
            placeholder={keyDef.kind === "secret" ? "Cole a chave aqui" : "Informe o valor"}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            className="max-w-md font-mono"
            disabled={saving}
          />
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? "Salvando…" : "Salvar"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={saving}
            onClick={() => {
              setEditing(false);
              setValue("");
            }}
          >
            Cancelar
          </Button>
        </div>
      )}
    </div>
  );
}
