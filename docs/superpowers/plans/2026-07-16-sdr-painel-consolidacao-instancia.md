# SDR — Consolidação do painel `/app/sdr` + escopo por instância (Parte C) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** move the SDR pilot's operational config (`sdr_settings.sdr_enabled`/`backstop_timeout_minutes`) from the AI hub into `/app/sdr`, add opt-in per-WhatsApp-instance scoping, and turn the two non-functional legacy sections (orçamento automático, escalonamento) into clearly-labeled placeholders — closing the confusing duplication between two "SDR ativo" toggles found this session.

**Architecture:** new column `whatsapp_accounts.sdr_enabled` (mirrors the existing `alerts_muted` per-account boolean pattern); the two real backend workers (`sdr-backstop-tick`, `sdr-respond`) gain a second gate on top of the existing store-wide `sdr_settings.sdr_enabled` check; `/app/sdr`'s "Configurações" tab is rewritten to be self-contained (own data fetching via the Provider Pattern, like `AiSdrTab` was); the AI hub's now-redundant "SDR" tab is deleted.

**Tech Stack:** TypeScript/React (Vite), Supabase Postgres migrations, Deno Edge Functions (`supabase/functions/**`), Vitest.

## Global Constraints

- TypeScript `strict: true`, no `any`. Domain interfaces prefixed `I`.
- `supabase/functions/**` is Deno-only, outside the root `tsconfig`/Vitest — no automated test coverage for edge function `index.ts` files (Global Constraint carried over from Parte B). Validate those tasks by code review + the dono's manual smoke test post-deploy.
- Migrations are **created but not applied** by any task in this plan — applying to production requires the dono's explicit authorization, done separately after the branch merges.
- Never hand-edit a file with an "AUTO-GENERATED MIRROR — DO NOT EDIT" banner. None of this plan's files are mirrors (no `_shared/whatsapp/**` or `_shared/sdr-escalation/**` changes needed here).
- `IWhatsAppAccount` currently has one boolean flag with an identical shape/purpose to what this plan adds (`alertsMuted: boolean`, migration `20260630160000_whatsapp_alerts_muted.sql`) — the new `sdrEnabled: boolean` field follows that exact precedent: **required** (not optional), defaulted to `false` everywhere, forwarded through `IWhatsAppAccountPatch`.
- Rollout is inert by construction: `whatsapp_accounts.sdr_enabled` defaults `false`, and `sdr_settings.sdr_enabled` is already `false` in every store (Parte B) — this plan changes zero real production behavior until the dono opts a store AND an instance in.

---

### Task 1: Migration — `whatsapp_accounts.sdr_enabled`

**Files:**
- Create: `supabase/migrations/20260716120000_whatsapp_sdr_enabled.sql`

**Interfaces:**
- Produces: column `public.whatsapp_accounts.sdr_enabled boolean not null default false` — consumed by Task 2 (types/providers), Task 3 (backend enforcement), Task 4 (UI).

- [ ] **Step 1: Write the migration**

```sql
-- SDR — per-instance opt-in (Parte C).
--
-- Mirrors whatsapp_accounts.alerts_muted (20260630160000): a plain boolean
-- flag per account, default false. The real pilot (sdr-backstop-tick,
-- sdr-respond) already gates on sdr_settings.sdr_enabled (store-wide); this
-- adds a second, narrower gate so the dono can opt in specific WhatsApp
-- numbers instead of every number connected to a store.
--
-- Conservative default confirmed with the dono: false everywhere, including
-- for stores that already have the store-wide pilot switched on — no
-- instance receives the SDR until explicitly opted in here.

alter table public.whatsapp_accounts
  add column if not exists sdr_enabled boolean not null default false;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260716120000_whatsapp_sdr_enabled.sql
git commit -m "feat(sdr): add whatsapp_accounts.sdr_enabled migration"
```

---

### Task 2: Types + provider impls — instance-level SDR flag

**Files:**
- Modify: `src/shared/types/conversation.ts` (`IWhatsAppAccount`)
- Modify: `src/providers/data/contracts/whatsappAccounts.ts` (`IWhatsAppAccountPatch`)
- Modify: `src/providers/data/impl/mock/whatsappAccounts.ts`
- Modify: `src/providers/data/impl/supabase/whatsappAccounts.ts`
- Modify: `src/mocks/generators/whatsappAccount.ts`
- Modify: `src/providers/data/impl/mock/whatsappAccounts.test.ts`
- Modify: `src/features/admin-settings/components/AddInstanceWizard.tsx`
- Modify: `src/features/conversations/utils/selectAccessibleAccounts.test.ts`
- Modify: `src/features/shell/hooks/useWhatsAppConnectionStatus.test.ts`

**Interfaces:**
- Consumes: migration from Task 1 (column name `sdr_enabled`).
- Produces: `IWhatsAppAccount.sdrEnabled: boolean`, `IWhatsAppAccountPatch.sdrEnabled?: boolean` — consumed by Task 3 (backend reads) and Task 4 (UI toggle via `provider.update(id, { sdrEnabled })`).

`sdrEnabled` is **required** on `IWhatsAppAccount` (same convention as `alertsMuted`) — every object literal that builds a full account (seed data, `create()` call sites, test fixtures) must set it explicitly. This task's file list is exhaustive: it was produced by grepping every `alertsMuted:` occurrence in the repo (the established sibling field) to find every such site.

- [ ] **Step 1: Add the field to the domain type**

In `src/shared/types/conversation.ts`, find the `IWhatsAppAccount` interface (has `alertsMuted: boolean;` near the end) and add the new field right after it:

```typescript
  /**
   * When true, disconnection/health alerts for this account are silenced:
   * ...
   */
  alertsMuted: boolean;
  /**
   * SDR pilot opt-in for this specific WhatsApp number (Parte C). The
   * store-wide `sdr_settings.sdr_enabled` switch must ALSO be on — this is a
   * second, narrower gate, not a replacement. Default `false`: an instance
   * never receives the SDR until explicitly opted in.
   */
  sdrEnabled: boolean;
}
```

- [ ] **Step 2: Add the field to the patch type**

In `src/providers/data/contracts/whatsappAccounts.ts`, in `IWhatsAppAccountPatch`:

```typescript
export interface IWhatsAppAccountPatch {
  label?: string;
  credentialsRef?: string;
  providerConfig?: IWhatsAppProviderConfig | null;
  failoverPolicy?: WhatsAppFailoverPolicy;
  failoverAccountId?: ID | null;
  isFailoverActive?: boolean;
  /** Silence disconnection/health alerts for this account (Owner action). */
  alertsMuted?: boolean;
  /** SDR pilot opt-in for this specific WhatsApp number (Parte C). */
  sdrEnabled?: boolean;
}
```

- [ ] **Step 3: Mock provider — forward the field on `update()`**

In `src/providers/data/impl/mock/whatsappAccounts.ts`, add one line to the `update` forwarding chain (right after the `alertsMuted` line):

```typescript
  update: (id, patch) =>
    whatsappAccountsApi.update(id, {
      ...(patch.label !== undefined ? { label: patch.label } : {}),
      ...(patch.credentialsRef !== undefined ? { credentialsRef: patch.credentialsRef } : {}),
      ...(patch.providerConfig !== undefined
        ? { providerConfig: patch.providerConfig ?? undefined }
        : {}),
      ...(patch.failoverPolicy !== undefined ? { failoverPolicy: patch.failoverPolicy } : {}),
      ...(patch.failoverAccountId !== undefined
        ? { failoverAccountId: patch.failoverAccountId ?? undefined }
        : {}),
      ...(patch.isFailoverActive !== undefined ? { isFailoverActive: patch.isFailoverActive } : {}),
      ...(patch.alertsMuted !== undefined ? { alertsMuted: patch.alertsMuted } : {}),
      ...(patch.sdrEnabled !== undefined ? { sdrEnabled: patch.sdrEnabled } : {}),
    }),
```

- [ ] **Step 4: Supabase provider — column, row mapping, create, update**

In `src/providers/data/impl/supabase/whatsappAccounts.ts`, four edits:

(a) `WhatsAppAccountRow` interface — add after `alerts_muted: boolean;`:

```typescript
  alerts_muted: boolean;
  waha_server_id: string | null;
  sdr_enabled: boolean;
}
```

(b) `COLUMNS` string — append the new column:

```typescript
const COLUMNS =
  "id, store_id, label, phone_number, provider, credentials_ref, status, capabilities, " +
  "provider_config, current_state, state_changed_at, failover_policy, failover_account_id, " +
  "is_failover_active, created_at, purpose, go_server_id, openwa_server_id, alerts_muted, waha_server_id, sdr_enabled";
```

(c) `rowToWhatsAppAccount` — add after `alertsMuted: row.alerts_muted ?? false,`:

```typescript
    alertsMuted: row.alerts_muted ?? false,
    wahaServerId: row.waha_server_id ?? undefined,
    sdrEnabled: row.sdr_enabled ?? false,
  };
}
```

(d) `create()` row builder — add after `alerts_muted: input.alertsMuted ?? false,`:

```typescript
      alerts_muted: input.alertsMuted ?? false,
      sdr_enabled: input.sdrEnabled ?? false,
    };
```

(e) `update()` patch forwarding — add after `if (patch.alertsMuted !== undefined) row.alerts_muted = patch.alertsMuted;`:

```typescript
    if (patch.alertsMuted !== undefined) row.alerts_muted = patch.alertsMuted;
    if (patch.sdrEnabled !== undefined) row.sdr_enabled = patch.sdrEnabled;
```

- [ ] **Step 5: Mock seed data — default `false` on all 3 accounts**

In `src/mocks/generators/whatsappAccount.ts`, add `sdrEnabled: false,` right after each of the 3 accounts' `alertsMuted: false,` line (id `wa-meta-matriz`, `wa-evo-campanhas`, `wa-openwa-filial`).

- [ ] **Step 6: Fix the existing provider test's `create()` calls**

In `src/providers/data/impl/mock/whatsappAccounts.test.ts`, add `sdrEnabled: false,` after each of the two `alertsMuted: false,` lines (inside the two `mockWhatsAppAccountsProvider.create({...})` calls, lines ~29 and ~58).

- [ ] **Step 7: Fix `AddInstanceWizard.tsx`'s 3 creation payloads**

In `src/features/admin-settings/components/AddInstanceWizard.tsx`, add `sdrEnabled: false,` right after each of the 3 occurrences of `alertsMuted: false,` (the evolution-go, openwa and evolution-v2 creation branches, lines ~208, ~248, ~279). New instances never start with the SDR pre-enabled.

- [ ] **Step 8: Fix the two other full-object test fixtures**

In `src/features/conversations/utils/selectAccessibleAccounts.test.ts`, add `sdrEnabled: false,` right after the `alertsMuted: false,` line (~22).

In `src/features/shell/hooks/useWhatsAppConnectionStatus.test.ts`, add `sdrEnabled: false,` right after the `alertsMuted: false,` line in the `makeAccount()` base object (~43) — this is the base literal every test's `makeAccount(overrides)` call builds on, so a single edit covers every call site in that file.

(`src/features/conversations/engine/instanceLock.test.ts` uses `Pick<IWhatsAppAccount, "status" | "isFailoverActive" | "alertsMuted">`, a narrow `Pick` — unaffected by this change, no edit needed there.)

- [ ] **Step 9: Run the test suite**

Run: `bun run test`
Expected: all tests pass, including `whatsappAccounts.test.ts`, `selectAccessibleAccounts.test.ts`, `useWhatsAppConnectionStatus.test.ts`, `instanceLock.test.ts`.

- [ ] **Step 10: Type-check the new files**

Run: `bunx tsc --noEmit`
Expected: no NEW errors introduced by this task (cross-check any errors against `git diff --name-status main...HEAD --diff-filter=A` — this project has a pre-existing `tsc` baseline unrelated to this change).

- [ ] **Step 11: Commit**

```bash
git add src/shared/types/conversation.ts src/providers/data/contracts/whatsappAccounts.ts src/providers/data/impl/mock/whatsappAccounts.ts src/providers/data/impl/supabase/whatsappAccounts.ts src/mocks/generators/whatsappAccount.ts src/providers/data/impl/mock/whatsappAccounts.test.ts src/features/admin-settings/components/AddInstanceWizard.tsx src/features/conversations/utils/selectAccessibleAccounts.test.ts src/features/shell/hooks/useWhatsAppConnectionStatus.test.ts
git commit -m "feat(sdr): add sdrEnabled to IWhatsAppAccount + provider impls"
```

---

### Task 3: Instance-scoped enforcement — `sdr-backstop-tick` + `sdr-respond`

**Files:**
- Modify: `supabase/functions/sdr-backstop-tick/index.ts`
- Modify: `supabase/functions/sdr-respond/index.ts`

**Interfaces:**
- Consumes: `whatsapp_accounts.sdr_enabled` (Task 1/2).
- Produces: no new interface — both workers now no-op on conversations whose WhatsApp instance has `sdr_enabled=false`, even when the store-wide `sdr_settings.sdr_enabled=true`.

- [ ] **Step 1: `sdr-backstop-tick` — filter candidates by instance**

In `supabase/functions/sdr-backstop-tick/index.ts`, extend the `IQueuedConversationRow` interface and the conversations select (step 2) to also fetch `whatsapp_account_id`, then add a new step 2.5 that resolves which of those accounts are SDR-enabled and drops the rest before the business-hours/activation loop:

```typescript
interface IQueuedConversationRow {
  id: string;
  store_id: string;
  queued_at: string;
  whatsapp_account_id: string | null;
}
```

```typescript
  // 2. Queued conversations for those stores (uses conversations_sdr_backstop_queue_idx).
  const { data: queued } = await admin
    .from("conversations")
    .select("id, store_id, queued_at, whatsapp_account_id")
    .in("store_id", pilotRows.map((r) => r.store_id))
    .is("assigned_seller_id", null)
    .eq("is_sdr_active", false)
    .eq("status", "aguardando")
    .not("queued_at", "is", null);
  let rows = (queued ?? []) as IQueuedConversationRow[];
  if (rows.length === 0) return json({ activated: 0 }, 200);

  // 2.5. Drop conversations whose WhatsApp instance hasn't opted into the SDR
  // (Parte C — per-instance scoping on top of the store-wide switch).
  const accountIds = [...new Set(rows.map((r) => r.whatsapp_account_id).filter((id): id is string => id !== null))];
  const { data: sdrAccounts } = await admin
    .from("whatsapp_accounts")
    .select("id")
    .in("id", accountIds.length > 0 ? accountIds : [""])
    .eq("sdr_enabled", true);
  const enabledAccountIds = new Set((sdrAccounts ?? []).map((a) => a.id as string));
  rows = rows.filter((r) => r.whatsapp_account_id !== null && enabledAccountIds.has(r.whatsapp_account_id));
  if (rows.length === 0) return json({ activated: 0 }, 200);
```

This replaces the existing `const rows = (queued ?? []) as IQueuedConversationRow[]; if (rows.length === 0) return json({ activated: 0 }, 200);` two lines — `rows` becomes `let` (reassigned by the filter) instead of `const`. Everything after (business hours lookup, activation loop) is unchanged and keeps reading `rows`.

- [ ] **Step 2: `sdr-respond` — check the conversation's instance**

In `supabase/functions/sdr-respond/index.ts`, extend step 1's select to include `whatsapp_account_id`, and add a new step 1.5 right after the existing `sdr_settings` kill-switch (step 2) that checks the instance flag:

```typescript
  // 1. Conversation + customer.
  const { data: conv } = await admin
    .from("conversations")
    .select("id, store_id, customer_id, is_sdr_active, whatsapp_account_id")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conv) return json({ skipped: "conversation not found" }, 200);
  if (!conv.is_sdr_active) return json({ skipped: "sdr not active on this conversation" }, 200);
  const storeId = conv.store_id as string;

  // 2. sdr_settings kill-switch (store-wide).
  const { data: pilot } = await admin
    .from("sdr_settings")
    .select("sdr_enabled")
    .eq("store_id", storeId)
    .maybeSingle();
  if (!pilot?.sdr_enabled) return json({ skipped: "sdr disabled for this store" }, 200);

  // 2.5. Per-instance opt-in (Parte C) — narrower gate on top of the store-wide switch.
  const whatsappAccountId = conv.whatsapp_account_id as string | null;
  if (!whatsappAccountId) return json({ skipped: "conversation has no whatsapp account" }, 200);
  const { data: account } = await admin
    .from("whatsapp_accounts")
    .select("sdr_enabled")
    .eq("id", whatsappAccountId)
    .maybeSingle();
  if (!account?.sdr_enabled) return json({ skipped: "sdr disabled for this instance" }, 200);
```

This replaces the existing steps 1 and 2 (select + kill-switch check), inserting the new 2.5 block between them and the rest of the handler (step 3 onward, `ai_settings routing`, is unchanged).

- [ ] **Step 3: Manual review — no automated test coverage**

Per Global Constraints, `supabase/functions/**` `index.ts` handlers have no Vitest coverage. Read the diff once more against the design doc's enforcement section before moving on; validation is by code review now and the dono's manual smoke test after deploy.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/sdr-backstop-tick/index.ts supabase/functions/sdr-respond/index.ts
git commit -m "feat(sdr): gate sdr-backstop-tick and sdr-respond on per-instance sdrEnabled"
```

---

### Task 4: `/app/sdr` Configurações tab — real config, instance list, placeholders

**Files:**
- Modify: `src/features/sdr-dashboard/components/tabs/SdrSettingsTab.tsx` (full rewrite)
- Modify: `src/features/sdr-dashboard/pages/SdrDashboardPage.tsx`
- Modify: `src/features/sdr-dashboard/components/tabs/SdrTemplatesTab.tsx` (one-line note)

**Interfaces:**
- Consumes: `useSdrPilotSettingsProvider()` (Parte B, unchanged), `useWhatsAppAccountsProvider()` (Task 2's `sdrEnabled` field).
- Produces: `SdrSettingsTab` becomes self-contained — new prop signature `{ canEdit: boolean; onJumpToTemplates: () => void }` (was `{ settings, loading, saving, update, canEdit, onJumpToTemplates }`, sourced from the legacy mock-only `IPlatformSettings`).

- [ ] **Step 1: Rewrite `SdrSettingsTab.tsx`**

Replace the entire file content:

```tsx
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Icon } from "@/components/Icon";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { useCurrentStore } from "@/features/multistore";
import { useSdrPilotSettingsProvider, useWhatsAppAccountsProvider } from "@/providers/data";
import type { ISdrPilotSettings, IWhatsAppAccount } from "@/shared/types";

export interface ISdrSettingsTabProps {
  canEdit: boolean;
  onJumpToTemplates: () => void;
}

export function SdrSettingsTab({ canEdit, onJumpToTemplates }: ISdrSettingsTabProps) {
  const { currentStoreId } = useCurrentStore();
  const pilotProvider = useSdrPilotSettingsProvider();
  const accountsProvider = useWhatsAppAccountsProvider();

  const [pilot, setPilot] = useState<ISdrPilotSettings | null>(null);
  const [timeoutInput, setTimeoutInput] = useState("2");
  const [accounts, setAccounts] = useState<IWhatsAppAccount[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentStoreId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void Promise.all([
      pilotProvider.get(currentStoreId),
      accountsProvider.list({ storeId: currentStoreId }),
      accountsProvider.listWaha({ storeId: currentStoreId }),
    ]).then(([settings, list, waha]) => {
      if (cancelled) return;
      const merged = new Map<string, IWhatsAppAccount>();
      for (const a of [...list, ...waha]) merged.set(a.id, a);
      setPilot(settings);
      setTimeoutInput(String(settings.backstopTimeoutMinutes));
      setAccounts([...merged.values()]);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [currentStoreId, pilotProvider, accountsProvider]);

  const patchPilot = async (p: { sdrEnabled?: boolean; backstopTimeoutMinutes?: number }) => {
    if (!currentStoreId) return;
    try {
      const updated = await pilotProvider.update(currentStoreId, p);
      setPilot(updated);
      toast.success("Alterações salvas.");
    } catch {
      toast.error("Não foi possível salvar as alterações.");
    }
  };

  const toggleInstance = async (account: IWhatsAppAccount, next: boolean) => {
    try {
      const updated = await accountsProvider.update(account.id, { sdrEnabled: next });
      setAccounts((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
      toast.success("Alterações salvas.");
    } catch {
      toast.error("Não foi possível salvar as alterações.");
    }
  };

  if (!currentStoreId) {
    return (
      <p className="text-sm text-muted-foreground">Selecione uma loja para configurar o SDR.</p>
    );
  }
  if (loading || !pilot) return <Skeleton className="h-96 w-full" />;

  return (
    <div className="space-y-4">
      {!canEdit && (
        <div className="rounded-md border border-amber-200/40 bg-amber-50/50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/30 dark:bg-amber-500/10 dark:text-amber-100">
          <span className="inline-flex items-center gap-2">
            <Icon icon="mdi:shield-lock-outline" size={14} />
            Configurações em modo leitura. Edição requer permissão de Owner.
          </span>
        </div>
      )}

      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Icon icon="mdi:robot-outline" size={16} className="text-primary" />
          Piloto
        </h3>
        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="text-sm font-medium">SDR ativo nesta loja</span>
          <Switch
            checked={pilot.sdrEnabled}
            onCheckedChange={(v) => void patchPilot({ sdrEnabled: v })}
            disabled={!canEdit}
            aria-label="SDR ativo nesta loja"
          />
        </div>
        <label className="mt-4 block text-xs text-muted-foreground">
          Tempo de espera até o SDR assumir (minutos)
          <input
            type="number"
            min={1}
            max={60}
            value={timeoutInput}
            disabled={!canEdit}
            onChange={(e) => setTimeoutInput(e.target.value)}
            onBlur={() => {
              const parsed = Math.min(60, Math.max(1, Number(timeoutInput) || 2));
              setTimeoutInput(String(parsed));
              if (pilot && parsed !== pilot.backstopTimeoutMinutes) {
                void patchPilot({ backstopTimeoutMinutes: parsed });
              }
            }}
            className="mt-1 w-full max-w-40 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
          />
        </label>
        <p className="mt-1 text-xs text-muted-foreground">
          Fora do horário comercial, o SDR assume imediatamente.
        </p>
        <p className="mt-3 flex items-start gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          <Icon icon="mdi:directions-fork" className="mt-0.5 size-4 shrink-0 text-primary" />
          Provedor, modelo e prompt de sistema do SDR são configurados em Configurações →
          Inteligência artificial → Funcionalidades.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Icon icon="mdi:cellphone-message" size={16} className="text-primary" />
          Instâncias
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Escolha em quais números WhatsApp o SDR atua. Nenhum ativado por padrão.
        </p>
        <div className="mt-3 space-y-2">
          {accounts.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nenhuma instância WhatsApp cadastrada nesta loja.
            </p>
          )}
          {accounts.map((account) => (
            <div
              key={account.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2"
            >
              <div>
                <p className="text-sm font-medium">{account.label}</p>
                <p className="text-xs text-muted-foreground">{account.phoneNumber || "—"}</p>
              </div>
              <Switch
                checked={account.sdrEnabled}
                onCheckedChange={(v) => void toggleInstance(account, v)}
                disabled={!canEdit}
                aria-label={`SDR ativo em ${account.label}`}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4 opacity-60">
        <div className="flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Icon icon="mdi:file-document-outline" size={16} className="text-primary" />
            Orçamento automático
          </h3>
          <Badge variant="secondary">Em breve</Badge>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          O SDR real ainda não gera orçamento nem aplica desconto — segue recepção e triagem, sem
          mencionar valores.
        </p>
        <div className="mt-4 space-y-4">
          <div>
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-medium">Validade padrão</span>
              <span className="text-xs text-muted-foreground tabular-nums">7 dias</span>
            </div>
            <Slider value={[7]} min={1} max={30} step={1} disabled className="mt-3" />
          </div>
          <div>
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-medium">Desconto autorizado</span>
              <span className="text-xs text-muted-foreground tabular-nums">0%</span>
            </div>
            <Slider value={[0]} min={0} max={10} step={1} disabled className="mt-3" />
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4 opacity-60">
        <div className="flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Icon icon="mdi:account-arrow-right-outline" size={16} className="text-primary" />
            Escalonamento
          </h3>
          <Badge variant="secondary">Em breve</Badge>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Timeout de resposta e broadcast urgente chegam numa entrega separada (Parte D).
        </p>
        <div className="mt-4 space-y-4">
          <div>
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-medium">Timeout fila urgente</span>
              <span className="text-xs text-muted-foreground tabular-nums">5 min</span>
            </div>
            <Slider value={[5]} min={1} max={30} step={1} disabled className="mt-3" />
          </div>
          <div>
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-medium">Timeout fila normal</span>
              <span className="text-xs text-muted-foreground tabular-nums">30 min</span>
            </div>
            <Slider value={[30]} min={5} max={60} step={5} disabled className="mt-3" />
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Icon icon="mdi:message-text-outline" size={16} className="text-primary" />
          Templates
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Os textos editados aqui não alimentam o SDR real hoje — o prompt real vive em
          Funcionalidades.
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onJumpToTemplates}
          className="mt-3 gap-1"
        >
          <Icon icon="mdi:arrow-right" size={14} />
          Ir para aba Templates
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire the real toggle into `SdrDashboardPage.tsx`**

In `src/features/sdr-dashboard/pages/SdrDashboardPage.tsx`:

(a) Add `useEffect` to the React import (currently `import { useMemo, useState } from "react";`):

```typescript
import { useEffect, useMemo, useState } from "react";
```

(b) Add the provider import:

```typescript
import { useSdrPilotSettingsProvider } from "@/providers/data";
```

(c) After the existing `const settingsCtl = usePlatformSettings(storeId);` line, add real-pilot state + fetch:

```typescript
  const settingsCtl = usePlatformSettings(storeId);
  const pilotProvider = useSdrPilotSettingsProvider();
  const [pilotEnabled, setPilotEnabled] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void pilotProvider.get(storeId).then((s) => {
      if (!cancelled) setPilotEnabled(s.sdrEnabled);
    });
    return () => {
      cancelled = true;
    };
  }, [storeId, pilotProvider]);
```

(d) Replace the old decorative source:

```typescript
  const canEdit = userRole === "Owner";
  const sdrEnabled = pilotEnabled;
```

(this replaces `const sdrEnabled = settingsCtl.settings?.sdrEnabled ?? false;` — `settingsCtl` itself is still used by `useSdrAlerts` and `SdrTemplatesTab`, unchanged)

(e) Update the `SdrSettingsTab` usage to the new prop signature:

```tsx
        <TabsContent value="settings" className="focus-visible:outline-none">
          <SdrSettingsTab canEdit={canEdit} onJumpToTemplates={() => setTab("templates")} />
        </TabsContent>
```

- [ ] **Step 3: Add a note to the Templates tab**

In `src/features/sdr-dashboard/components/tabs/SdrTemplatesTab.tsx`, the main `return (` (not the loading-state one) starts like this:

```tsx
  return (
    <div className="space-y-4">
      {!canEdit && (
        <div className="rounded-md border border-amber-200/40 bg-amber-50/50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/30 dark:bg-amber-500/10 dark:text-amber-100">
          <span className="inline-flex items-center gap-2">
            <Icon icon="mdi:shield-lock-outline" size={14} />
            Edição requer permissão de Owner. Você está visualizando os templates em modo leitura.
          </span>
        </div>
      )}

      <Accordion type="multiple" defaultValue={["greeting"]} className="space-y-3">
```

Insert a new note right after the `{!canEdit && (...)}` block and before `<Accordion ...>`:

```tsx
  return (
    <div className="space-y-4">
      {!canEdit && (
        <div className="rounded-md border border-amber-200/40 bg-amber-50/50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/30 dark:bg-amber-500/10 dark:text-amber-100">
          <span className="inline-flex items-center gap-2">
            <Icon icon="mdi:shield-lock-outline" size={14} />
            Edição requer permissão de Owner. Você está visualizando os templates em modo leitura.
          </span>
        </div>
      )}

      <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
        <Icon icon="mdi:directions-fork" className="mt-0.5 size-4 shrink-0 text-primary" />
        <span>
          Estes textos não alimentam o SDR real hoje — o prompt real é configurado em
          Configurações → Inteligência artificial → Funcionalidades.
        </span>
      </div>

      <Accordion type="multiple" defaultValue={["greeting"]} className="space-y-3">
```

(Everything from `<Accordion ...>` onward is unchanged — only the new `<div>` is inserted.)

- [ ] **Step 4: Run the test suite and type-check**

Run: `bun run test`
Expected: all tests pass (this task touches no test files directly, but confirm nothing regressed).

Run: `bunx tsc --noEmit`
Expected: no new errors from the modified files.

- [ ] **Step 5: Commit**

```bash
git add src/features/sdr-dashboard/components/tabs/SdrSettingsTab.tsx src/features/sdr-dashboard/pages/SdrDashboardPage.tsx src/features/sdr-dashboard/components/tabs/SdrTemplatesTab.tsx
git commit -m "feat(sdr): real Configurações tab in /app/sdr (piloto + instâncias + placeholders)"
```

---

### Task 5: Remove the AI hub's redundant "SDR" tab

**Files:**
- Modify: `src/features/ai-settings/pages/AiSettingsPage.tsx`
- Delete: `src/features/ai-settings/pages/AiSdrTab.tsx`
- Modify: `src/routes/app.configuracoes.ia.tsx`
- Modify: `src/features/ai-settings/i18n/pt-BR.ts`
- Modify: `src/features/ai-settings/pages/AiFeaturesTab.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new — this task only removes the now-redundant tab and adds a pointer from the Funcionalidades tab to `/app/sdr`.

- [ ] **Step 1: Remove the tab from `AiSettingsPage.tsx`**

In `src/features/ai-settings/pages/AiSettingsPage.tsx`, remove the `AiSdrTab` import, the `<TabsTrigger value="sdr">` line and the `<TabsContent value="sdr">` block:

```tsx
import { useNavigate } from "@tanstack/react-router";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Route } from "@/routes/app.configuracoes.ia";
import { useAiSettings } from "../hooks/useAiSettings";
import { AiMasterSwitch } from "../components/AiMasterSwitch";
import { AiOverviewTab } from "./AiOverviewTab";
import { AiProvidersTab } from "./AiProvidersTab";
import { AiFeaturesTab } from "./AiFeaturesTab";
import { AiPlaygroundTab } from "./AiPlaygroundTab";
import { AI_STRINGS } from "../i18n/pt-BR";

export function AiSettingsPage() {
  const navigate = useNavigate();
  const { aba } = Route.useSearch();
  const { settings, loading, reload } = useAiSettings();

  const setAba = (v: string) => {
    void navigate({ to: "/app/configuracoes/ia", search: { aba: v as typeof aba } });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{AI_STRINGS.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{AI_STRINGS.subtitle}</p>
        </div>
        {loading || !settings ? (
          <Skeleton className="h-8 w-28" />
        ) : (
          <AiMasterSwitch enabled={settings.masterEnabled} onChanged={reload} />
        )}
      </div>

      <Tabs value={aba} onValueChange={setAba}>
        <TabsList>
          <TabsTrigger value="visao-geral">{AI_STRINGS.tabs.overview}</TabsTrigger>
          <TabsTrigger value="provedores">{AI_STRINGS.tabs.providers}</TabsTrigger>
          <TabsTrigger value="funcionalidades">{AI_STRINGS.tabs.features}</TabsTrigger>
          <TabsTrigger value="playground">{AI_STRINGS.tabs.playground}</TabsTrigger>
        </TabsList>
        <TabsContent value="visao-geral" className="mt-4">
          <AiOverviewTab />
        </TabsContent>
        <TabsContent value="provedores" className="mt-4">
          <AiProvidersTab />
        </TabsContent>
        <TabsContent value="funcionalidades" className="mt-4">
          <AiFeaturesTab />
        </TabsContent>
        <TabsContent value="playground" className="mt-4">
          <AiPlaygroundTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

- [ ] **Step 2: Delete `AiSdrTab.tsx`**

```bash
git rm src/features/ai-settings/pages/AiSdrTab.tsx
```

- [ ] **Step 3: Narrow the route's search validation**

In `src/routes/app.configuracoes.ia.tsx`, drop `"sdr"` from `ABAS`:

```typescript
const ABAS = ["visao-geral", "provedores", "funcionalidades", "playground"] as const;
```

(`validateSearch` already falls back to `"visao-geral"` for any value not in `ABAS` — a stale bookmark to `?aba=sdr` degrades gracefully with no extra handling needed.)

- [ ] **Step 4: Remove the now-unused i18n strings**

In `src/features/ai-settings/i18n/pt-BR.ts`, remove `sdr: "SDR",` from `tabs` and remove the entire `sdrPilot: {...}` block:

```typescript
export const AI_STRINGS = {
  title: "Inteligência artificial",
  subtitle: "Provedores, modelos por funcionalidade e consumo · configuração global da plataforma",
  tabs: {
    overview: "Visão geral",
    providers: "Provedores & chaves",
    features: "Funcionalidades",
    playground: "Playground",
  },
  masterOn: "IA ativa",
  masterOff: "IA desativada",
  emptyUsage: "Nenhum consumo registrado ainda — configure um provedor para começar.",
  saved: "Alterações salvas.",
  saveError: "Não foi possível salvar as alterações.",
} as const;
```

- [ ] **Step 5: Add a pointer from Funcionalidades to `/app/sdr`**

In `src/features/ai-settings/pages/AiFeaturesTab.tsx`, import `Link` and render a one-line note right after the `sdr` feature's row:

```tsx
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
```

- [ ] **Step 6: Run the test suite and type-check**

Run: `bun run test`
Expected: all tests pass.

Run: `bunx tsc --noEmit`
Expected: no new errors (in particular, confirm nothing outside this plan's files still imports `AiSdrTab` or `AI_STRINGS.sdrPilot`/`AI_STRINGS.tabs.sdr`).

- [ ] **Step 7: Commit**

```bash
git add src/features/ai-settings/pages/AiSettingsPage.tsx src/routes/app.configuracoes.ia.tsx src/features/ai-settings/i18n/pt-BR.ts src/features/ai-settings/pages/AiFeaturesTab.tsx
git commit -m "refactor(sdr): remove redundant SDR tab from AI hub, point to /app/sdr"
```

---

## Final check (whole branch)

- [ ] Run `bun run build` — confirm the app still builds.
- [ ] Run `bun run test` — full suite green.
- [ ] Run `bunx tsc --noEmit` — no new errors vs. the pre-existing baseline.
- [ ] Manually confirm (via `git log`/`git diff origin/main...HEAD`) that no migration was applied and no Edge Function was deployed — this plan only touches versioned files.
