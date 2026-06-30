# WhatsApp Multi-Instância — Plano 4: UI

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) ou superpowers:executing-plans. Steps usam checkbox (`- [ ]`).

**Goal:** Entregar as 5 superfícies de UI do multi-instância: Hub de instâncias, wizard "Adicionar número", Sheet "Configurar acesso", Dialog "Nova conversa" (provider-aware) e o componente read-only `OriginChip`.

**Architecture:** React 19 + Tailwind v4 + shadcn/ui (new-york). **Apenas tokens semânticos** (`bg-background`, `text-foreground`, `severity-*`) — exceto a cor de **identidade** da instância (paleta fechada, análoga a cor de avatar). Dados via Provider Pattern (`useWhatsAppAccountsProvider`, do Plano 2). **Referência visual:** os mockups validados no companion em `.superpowers/brainstorm/441-1781527664/content/` (`hub-instancias.html`, `adicionar-numero.html`, `tela-configurar-acesso.html`, `nova-conversa.html`, `origin-chip.html`).

**Tech Stack:** React, TanStack Query, shadcn/ui (Dialog, Sheet, Badge), Vitest.

**Depende dos Planos 1–3.** UI de **participantes** (Camada 2 — adicionar co-responsável via @menção/manual) reusa o sistema de notas existente e fica como extensão pós-MVP (a fundação já existe). `departamento` nos seletores de acesso fica **bloqueado até o PRD-211** (mockup já prevê).

---

## File Structure

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `src/features/conversations/utils/instanceAccent.ts` | Create | Cor de identidade por id de instância |
| `src/features/conversations/utils/instanceAccent.test.ts` | Create | Teste do helper (determinístico) |
| `src/features/conversations/components/OriginChip.tsx` | Create | Chip read-only de origem (3 variantes) |
| `src/features/admin-settings/utils/accessRecipients.ts` | Create | Resolve "N pessoas" das regras de acesso |
| `src/features/admin-settings/utils/accessRecipients.test.ts` | Create | Teste de contagem única (OU) |
| `src/features/admin-settings/pages/WhatsAppAccountsPage.tsx` | Modify | hex→tokens, chip finalidade, resumo de acesso, botão "Adicionar número" |
| `src/features/admin-settings/components/AddInstanceWizard.tsx` | Create | Wizard de criação (Identificação → Conexão → Acesso) |
| `src/features/admin-settings/components/InstanceAccessSheet.tsx` | Create | Sheet "Configurar acesso" + preview do OU |
| `src/features/conversations/components/NewConversationDialog.tsx` | Create | Dialog "Nova conversa" provider-aware |
| `src/features/conversations/components/InboxHeader.tsx` | Modify | Botão "Nova conversa" |
| `src/features/conversations/components/ConversationHeader.tsx` | Modify | `OriginChip` no cluster de ações (fora do subtítulo) |
| `src/features/conversations/components/MessageInput.tsx` | Modify | Faixa "Respondendo por ●" |
| `src/features/conversations/components/ConversationListItem.tsx` | Modify | Faixa de cor de origem (só multi) |

---

## Task 1: `instanceAccent` + `OriginChip`

**Files:**
- Create: `src/features/conversations/utils/instanceAccent.ts`
- Create: `src/features/conversations/utils/instanceAccent.test.ts`
- Create: `src/features/conversations/components/OriginChip.tsx`

- [ ] **Step 1: Teste do helper (falha)**

`src/features/conversations/utils/instanceAccent.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { instanceAccent } from "./instanceAccent";

describe("instanceAccent", () => {
  it("is deterministic for the same id", () => {
    expect(instanceAccent("wa-evo-campanhas")).toBe(instanceAccent("wa-evo-campanhas"));
  });
  it("returns a hex from the closed palette", () => {
    expect(instanceAccent("wa-evo-campanhas")).toMatch(/^#[0-9a-f]{6}$/i);
  });
  it("does not collide with severity colors", () => {
    const severity = ["#22c55e", "#f59e0b", "#f87171", "#ef4444"];
    expect(severity).not.toContain(instanceAccent("any-id"));
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `bun run test src/features/conversations/utils/instanceAccent.test.ts` → FAIL (módulo inexistente).

- [ ] **Step 3: Implementar**

`src/features/conversations/utils/instanceAccent.ts`:
```typescript
/**
 * Identity color for a WhatsApp instance, derived from its id. A closed palette
 * that NEVER overlaps the severity tokens — color encodes identity, never state.
 */
const INSTANCE_PALETTE = ["#2dd4bf", "#a78bfa", "#f472b6", "#818cf8", "#fb923c", "#38bdf8"];

export function instanceAccent(accountId: string): string {
  let hash = 0;
  for (const ch of accountId) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return INSTANCE_PALETTE[hash % INSTANCE_PALETTE.length];
}
```

- [ ] **Step 4: Rodar e passar** — `bun run test src/features/conversations/utils/instanceAccent.test.ts` → PASS.

- [ ] **Step 5: Criar o `OriginChip`**

`src/features/conversations/components/OriginChip.tsx`:
```tsx
import type { IWhatsAppAccount } from "@/shared/types";
import { formatPhone } from "@/shared/utils/format";
import { instanceAccent } from "../utils/instanceAccent";

export interface IOriginChipProps {
  account: IWhatsAppAccount | null;
  /** dot = só a bolinha (lista/compacto); label = bolinha+apelido; full = +número. */
  variant?: "dot" | "label" | "full";
  className?: string;
}

export function OriginChip({ account, variant = "label", className }: IOriginChipProps) {
  if (!account) return null;
  const color = instanceAccent(account.id);
  const dot = (
    <span
      aria-hidden
      className="inline-block size-2 shrink-0 rounded-full"
      style={{ backgroundColor: color }}
    />
  );
  if (variant === "dot") {
    return (
      <span className={className} title={`Origem: ${account.label}`} aria-label={`Origem: ${account.label}`}>
        {dot}
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-0.5 text-xs text-foreground ${className ?? ""}`}
      title={`Origem: ${account.label}`}
    >
      {dot}
      <span className="truncate">{account.label}</span>
      {variant === "full" && account.phoneNumber ? (
        <span className="text-muted-foreground">· {formatPhone(account.phoneNumber)}</span>
      ) : null}
    </span>
  );
}
```

- [ ] **Step 6: Commit**
```bash
git add src/features/conversations/utils/instanceAccent.ts src/features/conversations/utils/instanceAccent.test.ts src/features/conversations/components/OriginChip.tsx
git commit -m "feat: OriginChip + instanceAccent identity color helper"
```

---

## Task 2: `accessRecipients` (contagem única do OU)

**Files:**
- Create: `src/features/admin-settings/utils/accessRecipients.ts`
- Create: `src/features/admin-settings/utils/accessRecipients.test.ts`

- [ ] **Step 1: Teste (falha)**

`src/features/admin-settings/utils/accessRecipients.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { resolveAccessRecipients } from "./accessRecipients";

const SELLERS = [
  { id: "s1", role: "seller_internal", storeId: "loja-1" },
  { id: "s2", role: "seller_internal", storeId: "loja-1" },
  { id: "s3", role: "sdr", storeId: "loja-1" },
];

describe("resolveAccessRecipients", () => {
  it("counts a role rule by matching sellers", () => {
    const set = resolveAccessRecipients([{ kind: "role", targetValue: "seller_internal" }], SELLERS);
    expect(set.size).toBe(2);
  });
  it("does not double-count a seller already covered by a role (unique OR)", () => {
    const set = resolveAccessRecipients(
      [{ kind: "role", targetValue: "seller_internal" }, { kind: "seller", targetValue: "s1" }],
      SELLERS,
    );
    expect(set.size).toBe(2); // s1 já estava pelo papel
  });
  it("store rule covers everyone in the store", () => {
    const set = resolveAccessRecipients([{ kind: "store", targetValue: "loja-1" }], SELLERS);
    expect(set.size).toBe(3);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `bun run test src/features/admin-settings/utils/accessRecipients.test.ts` → FAIL.

- [ ] **Step 3: Implementar**

`src/features/admin-settings/utils/accessRecipients.ts`:
```typescript
export interface IAccessRuleLike {
  kind: string;
  targetValue: string;
}
export interface ISellerLike {
  id: string;
  role: string;
  storeId: string;
}

/** Conjunto ÚNICO de sellers cobertos pelo OU das regras (sem dupla contagem). */
export function resolveAccessRecipients(
  rules: IAccessRuleLike[],
  sellers: ISellerLike[],
): Set<string> {
  const result = new Set<string>();
  for (const s of sellers) {
    const matched = rules.some(
      (r) =>
        (r.kind === "seller" && r.targetValue === s.id) ||
        (r.kind === "role" && r.targetValue === s.role) ||
        (r.kind === "store" && r.targetValue === s.storeId),
    );
    if (matched) result.add(s.id);
  }
  return result;
}
```

- [ ] **Step 4: Rodar e passar** — PASS (3/3).

- [ ] **Step 5: Commit**
```bash
git add src/features/admin-settings/utils/accessRecipients.ts src/features/admin-settings/utils/accessRecipients.test.ts
git commit -m "feat: resolveAccessRecipients (unique OR count for access preview)"
```

---

## Task 3: Hub de instâncias (tokens + finalidade + acesso + Adicionar número)

**Files:**
- Modify: `src/features/admin-settings/pages/WhatsAppAccountsPage.tsx:37-94,388-433`

Referência visual: `hub-instancias.html`.

- [ ] **Step 1: Migrar hex → tokens em `STATUS_VISUAL` e `HEALTH_VISUAL` (linhas 37-94)**

Substituir as classes hex pelos tokens severity. Mapeamento exato:
- `border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300` → `border-severity-success/40 bg-severity-success/10 text-severity-success`
- `border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300` → `border-severity-critical/40 bg-severity-critical/10 text-severity-critical`
- `border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300` → `border-severity-warning/40 bg-severity-warning/10 text-severity-warning`

Aplicar o mesmo mapeamento aos quatro estados de `HEALTH_VISUAL` (`healthy`→success, `degraded`→warning, `down`→critical, `paused`→muted: `border-border bg-muted text-muted-foreground`).

- [ ] **Step 2: Chip de finalidade no card (linha ~400)**

No card de cada conta, ao lado do label, renderizar o `purpose`:
```tsx
<span className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground">
  {{ atendimento: "Atendimento", campanha: "Campanha", ambos: "Atendimento + Campanha" }[account.purpose]}
</span>
```

- [ ] **Step 3: Resumo de acesso ("N pessoas")**

Carregar regras + sellers e mostrar a contagem. No componente do card, usar `useSellersProvider().list({ storeId })` (já disponível na página) e `provider.getAccessRules(account.id)` (TanStack Query). Render:
```tsx
const recipients = resolveAccessRecipients(rules, sellers.map((s) => ({ id: s.id, role: s.role, storeId: s.storeId })));
// …
<button className="text-xs text-muted-foreground hover:text-foreground" onClick={() => openAccess(account)}>
  👥 {recipients.size === 0 ? "Ninguém vê — configurar" : `${recipients.size} pessoas`}
</button>
```
Quando `recipients.size === 0`, o texto usa `text-severity-warning` (instância fantasma).

- [ ] **Step 4: Botão "Adicionar número" no header da página**

No header (junto ao título da página), adicionar:
```tsx
<Button onClick={() => setWizardOpen(true)}>
  <Icon icon="lucide:plus" className="size-4" /> Adicionar número
</Button>
{wizardOpen && (
  <AddInstanceWizard
    onClose={() => setWizardOpen(false)}
    onCreated={() => { setWizardOpen(false); refetchAccounts(); }}
  />
)}
```
(Estado `const [wizardOpen, setWizardOpen] = useState(false);` no topo do componente; `AddInstanceWizard` vem da Task 4; `InstanceAccessSheet` da Task 5, controlado por `openAccess`.)

- [ ] **Step 5: Verificar tokens no design-system + build**

Run: `bun run build`
Expected: build OK. Validar contraste das badges em `/design-system` (4 temas × 2 modos) manualmente.

- [ ] **Step 6: Commit**
```bash
git add src/features/admin-settings/pages/WhatsAppAccountsPage.tsx
git commit -m "feat: instance hub — tokens, purpose chip, access summary, add-number entry"
```

---

## Task 4: Wizard "Adicionar número"

**Files:**
- Create: `src/features/admin-settings/components/AddInstanceWizard.tsx`

Referência visual: `adicionar-numero.html`. Reusa `useEvolutionPairing` + `QrPairingStep` (Plano 2 deu o `create`).

- [ ] **Step 1: Esqueleto com estado e os 3 passos**

`src/features/admin-settings/components/AddInstanceWizard.tsx` — estrutura completa (handlers reais; o JSX de cada passo segue o mockup):
```tsx
import { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { QrPairingStep } from "./QrPairingStep";
import { useEvolutionPairing } from "../hooks/useEvolutionPairing";
import { useWhatsAppAccountsProvider } from "@/providers/data";
import { useCurrentStore } from "@/features/multistore";
import type { IWhatsAppAccount, WhatsAppAccountPurpose } from "@/shared/types";

type Phase = "form" | "creating" | "qr" | "done";

const EVOLUTION_CAPS: IWhatsAppAccount["capabilities"] = {
  supportsTemplatesHsm: false, supportsInteractiveButtons: false, supportsLists: false,
  supportsReactions: true, supportsProactiveMessaging: true, supportsReadStatusInGroups: true,
};

function slugify(label: string): string {
  return label.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 24);
}

export function AddInstanceWizard({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const provider = useWhatsAppAccountsProvider();
  const { currentStoreId } = useCurrentStore();
  const [phase, setPhase] = useState<Phase>("form");
  const [label, setLabel] = useState("");
  const [purpose, setPurpose] = useState<WhatsAppAccountPurpose>("atendimento");
  const [accountId, setAccountId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const instanceName = label ? `${slugify(label)}-${Math.abs(hashCode(label)).toString(16).slice(0, 3)}` : "";
  const pairing = useEvolutionPairing(phase === "qr" ? accountId : null);

  async function handleCreate() {
    setError(null);
    setPhase("creating");
    try {
      const created = await provider.create({
        storeId: currentStoreId,
        label,
        phoneNumber: "",
        provider: "evolution",
        credentialsRef: instanceName,
        status: "pending",
        capabilities: EVOLUTION_CAPS,
        providerConfig: { baseUrl: "", instanceName },
        currentState: "healthy",
        failoverPolicy: "disabled",
        isFailoverActive: false,
        purpose,
      });
      setAccountId(created.id);
      setPhase("qr"); // useEvolutionPairing cria a instância no servidor + emite o QR
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao criar instância");
      setPhase("form");
    }
  }

  // phase "qr" → quando pairing.phase === "open", avançar para "done"
  if (phase === "qr" && pairing.phase === "open" && accountId) {
    setPhase("done");
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        {/* Stepper 1·Identificação 2·Conexão 3·Acesso conforme adicionar-numero.html */}
        {phase === "form" && (
          <div className="space-y-4">
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Apelido da instância" />
            <div className="flex gap-2">
              {(["atendimento", "campanha", "ambos"] as const).map((p) => (
                <button key={p} onClick={() => setPurpose(p)}
                  className={`rounded-full border px-3 py-1 text-xs ${purpose === p ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}>
                  {{ atendimento: "Atendimento", campanha: "Campanha", ambos: "Ambos" }[p]}
                </button>
              ))}
            </div>
            <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs">
              <span className="text-muted-foreground">ID técnico (gerado): </span>
              <span className="font-mono">{instanceName || "—"}</span>
            </div>
            {error && <p className="text-xs text-severity-critical">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onClose}>Cancelar</Button>
              <Button disabled={!label.trim()} onClick={handleCreate}>Criar e conectar</Button>
            </div>
          </div>
        )}
        {phase === "creating" && <p className="py-8 text-center text-sm text-primary">Criando instância no servidor Evolution…</p>}
        {phase === "qr" && <QrPairingStep pairing={pairing} />}
        {phase === "done" && (
          <div className="space-y-4 py-6 text-center">
            <p className="text-severity-success">✓ Conectado! {pairing.profile.phoneNumber}</p>
            <div className="flex justify-center gap-2">
              <Button variant="outline" onClick={() => { onCreated(); }}>Concluir</Button>
              <Button onClick={() => { onCreated(); /* o pai abre o InstanceAccessSheet com o accountId */ }}>
                Configurar quem acessa
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function hashCode(s: string): number {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return h;
}
```

> Nota: o `useEvolutionPairing` atual pareia uma conta existente; aqui ele recebe o `accountId` recém-criado. Se o servidor Evolution exigir um `POST /instance/create` explícito antes do QR, esse passo entra na edge `whatsapp-connect` (estendê-la para criar a instância quando ainda não existe) — verificar no Step 2.

- [ ] **Step 2: Garantir criação da instância no servidor**

Verificar em `supabase/functions/whatsapp-connect/index.ts` se o fluxo de QR já cria a instância no Evolution quando ela não existe (`POST /instance/create`). Se **não**, adicionar essa criação idempotente antes de emitir o QR (a conta no banco já existe; falta a instância no servidor). Cobrir com o smoke do Step 3.

- [ ] **Step 3: Smoke manual (autorizado)** — o dono cria "Comercial Volvo", vê "criando instância…", pareia o QR, conecta; a conta aparece no Hub com finalidade e "Ninguém vê — configurar".

- [ ] **Step 4: Commit**
```bash
git add src/features/admin-settings/components/AddInstanceWizard.tsx
git commit -m "feat: AddInstanceWizard (create instance + QR pairing)"
```

---

## Task 5: Sheet "Configurar acesso"

**Files:**
- Create: `src/features/admin-settings/components/InstanceAccessSheet.tsx`

Referência visual: `tela-configurar-acesso.html` (o preview do OU é a estrela).

- [ ] **Step 1: Componente com carga/edição de regras e preview reativo**

`src/features/admin-settings/components/InstanceAccessSheet.tsx` — estrutura (handlers reais; JSX das seções OU conforme o mockup):
```tsx
import { useEffect, useState } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useWhatsAppAccountsProvider, useSellersProvider } from "@/providers/data";
import { resolveAccessRecipients } from "../utils/accessRecipients";
import type { IWhatsAppAccount, ISeller } from "@/shared/types";

type DraftRule = { kind: "seller" | "role" | "store"; targetValue: string };

export function InstanceAccessSheet({ account, storeId, onClose }: {
  account: IWhatsAppAccount; storeId: string; onClose: () => void;
}) {
  const provider = useWhatsAppAccountsProvider();
  const sellersProvider = useSellersProvider();
  const [rules, setRules] = useState<DraftRule[]>([]);
  const [sellers, setSellers] = useState<ISeller[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void provider.getAccessRules(account.id).then((r) =>
      setRules(r.map((x) => ({ kind: x.kind, targetValue: x.targetValue }))));
    void sellersProvider.list({ storeId }).then(setSellers);
  }, [account.id, storeId, provider, sellersProvider]);

  const recipients = resolveAccessRecipients(
    rules,
    sellers.map((s) => ({ id: s.id, role: s.role, storeId: s.storeId })),
  );
  const byRole = rules.filter((r) => r.kind === "role").length;
  const byIndividual = rules.filter((r) => r.kind === "seller").length;

  async function handleSave() {
    setSaving(true);
    try {
      await provider.replaceAccessRules(account.id, rules);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right">
        {/* Preview reativo (a estrela) */}
        <div className={`rounded-lg border p-3 ${recipients.size === 0 ? "border-severity-warning/40 bg-severity-warning/10" : "border-primary/40 bg-primary/10"}`}>
          {recipients.size === 0 ? (
            <p className="text-sm font-semibold text-severity-warning">0 pessoas — ninguém vê as conversas</p>
          ) : (
            <>
              <p className="text-sm font-semibold text-primary">👥 {recipients.size} pessoas enxergam esta instância</p>
              <p className="text-xs text-muted-foreground">
                {byRole > 0 && `${recipients.size - byIndividual} por papel`}
                {byRole > 0 && byIndividual > 0 && " · "}
                {byIndividual > 0 && `+${byIndividual} individual`}
                {" · contagem única"}
              </p>
            </>
          )}
        </div>

        {/* Seções OU: Atendentes / Por papel / Por loja — manipulam `rules` (add/remove DraftRule).
            Departamento: bloqueado com nota "Disponível após o módulo de Departamentos (PRD-211)". */}

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          {recipients.size === 0 ? (
            <Button variant="destructive" onClick={handleSave} disabled={saving}>Salvar sem acesso</Button>
          ) : (
            <Button onClick={handleSave} disabled={saving}>Salvar</Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 2: Fiação na página** — `WhatsAppAccountsPage` controla `const [accessAccount, setAccessAccount] = useState<IWhatsAppAccount | null>(null)`; `openAccess(account)` seta; renderiza `{accessAccount && <InstanceAccessSheet account={accessAccount} storeId={currentStoreId} onClose={() => { setAccessAccount(null); refetchRules(); }} />}`.

- [ ] **Step 3: Build + smoke** — `bun run build`; o dono abre o Sheet, marca o papel "Vendedor", vê "N pessoas", salva; reabre e confirma persistência.

- [ ] **Step 4: Commit**
```bash
git add src/features/admin-settings/components/InstanceAccessSheet.tsx src/features/admin-settings/pages/WhatsAppAccountsPage.tsx
git commit -m "feat: InstanceAccessSheet with reactive OR preview"
```

---

## Task 6: Dialog "Nova conversa" (provider-aware) + entrada no Inbox

**Files:**
- Create: `src/features/conversations/components/NewConversationDialog.tsx`
- Modify: `src/features/conversations/components/InboxHeader.tsx:24-43`

Referência visual: `nova-conversa.html`.

- [ ] **Step 1: Dialog com origem-primeiro e composer provider-aware**

`NewConversationDialog.tsx` — handlers reais; JSX dos 3 passos conforme o mockup:
```tsx
import { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useWhatsAppAccountsProvider } from "@/providers/data";
import { useWhatsAppConnectionStatus } from "@/features/shell/hooks/useWhatsAppConnectionStatus";
import type { IWhatsAppAccount } from "@/shared/types";

export function NewConversationDialog({ onClose, onCreated }: {
  onClose: () => void; onCreated: (conversationId: string) => void;
}) {
  // Só instâncias que o usuário ACESSA já vêm filtradas pela RLS no list().
  const { accounts } = useWhatsAppConnectionStatus();
  const usable = accounts.filter((a) => a.status === "connected");
  const [origin, setOrigin] = useState<IWhatsAppAccount | null>(usable[0] ?? null);
  const [phone, setPhone] = useState("");
  const [text, setText] = useState("");
  const isEvolution = origin?.provider === "evolution";

  // O passo 3 é travado pela origem: Evolution = texto livre + anti-ban; Meta = TemplatePicker.
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        {/* 1 · Origem (select de `usable`, OriginChip por item) */}
        {/* 2 · Destino (Input phone — número inédito ou busca de cliente) */}
        {/* 3 · Mensagem provider-aware: */}
        {isEvolution ? (
          <>
            <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Mensagem…" />
            <div className="rounded-md border border-severity-warning/40 bg-severity-warning/10 p-2 text-xs text-severity-warning">
              ⚠️ Primeira mensagem para número novo. Evite conteúdo promocional (anti-ban).
            </div>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">Origem Meta: selecione um template HSM aprovado (TemplatePicker).</p>
        )}
        <p className="text-xs text-muted-foreground">👤 Você ficará como responsável por esta conversa.</p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button disabled={!origin || !phone} onClick={() => {/* cria conversa + 1ª msg; ver Step 2 */}}>
            Iniciar conversa
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Criação da conversa (responsável = quem cria)**

A ação "Iniciar conversa" cria uma `IConversation` com `whatsappAccountId = origin.id`, `assignedSellerId = <seller atual>`, `channel = "whatsapp"`, vinculando ao cliente (se a busca casou) ou criando o contato. Reusar o `useConversationsProvider().create(...)` (mesmo padrão store-scoped do Plano 2) e então despachar a 1ª mensagem por `useMessageSend()` (texto no Evolution; template no Meta). Ao concluir, `onCreated(conversationId)` navega para a conversa.

> Para Meta, integrar o `TemplatePicker` já existente (usado no composer) em vez do textarea — mesma engine de template do envio normal.

- [ ] **Step 3: Botão no `InboxHeader`**

Em `InboxHeader.tsx` (1ª linha, ~24-43), adicionar à direita:
```tsx
<Button size="sm" onClick={onNewConversation}>
  <Icon icon="lucide:plus" className="size-4" /> Nova conversa
</Button>
```
Adicionar `onNewConversation: () => void` às props; o `InboxPage` controla o estado e renderiza `<NewConversationDialog />`.

- [ ] **Step 4: Build + smoke** — `bun run build`; o dono inicia conversa com número novo por uma instância Evolution → texto livre + aviso; a conversa nasce atribuída a ele.

- [ ] **Step 5: Commit**
```bash
git add src/features/conversations/components/NewConversationDialog.tsx src/features/conversations/components/InboxHeader.tsx
git commit -m "feat: NewConversationDialog (origin-first, provider-aware) + inbox entry"
```

---

## Task 7: `OriginChip` nos 3 contextos

**Files:**
- Modify: `src/features/conversations/components/ConversationHeader.tsx:159-208`
- Modify: `src/features/conversations/components/MessageInput.tsx`
- Modify: `src/features/conversations/components/ConversationListItem.tsx:116-122`

Referência visual: `origin-chip.html`. **Regra:** nunca no subtítulo do contato (L86-92).

- [ ] **Step 1: Header — chip no cluster de ações**

Em `ConversationHeader.tsx`, no cluster direito (linhas 159-208, junto ao StatusControl), renderizar quando houver conta:
```tsx
{whatsappAccount && <OriginChip account={whatsappAccount} variant="label" />}
```
(O `whatsappAccount` já é prop do header.) Importar `OriginChip`.

- [ ] **Step 2: Composer — faixa "Respondendo por ●"**

Em `MessageInput.tsx`, acima do textarea, quando `whatsappAccount` presente:
```tsx
{whatsappAccount && (
  <div className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
    <span>Respondendo por</span>
    <OriginChip account={whatsappAccount} variant="label" />
  </div>
)}
```

- [ ] **Step 3: Lista — faixa de cor (só multi-instância)**

A faixa lateral de status já existe (`ConversationListItem.tsx:116-122`, `absolute left-0 h-full w-[3px]`). Adicionar uma segunda faixa fina de **origem** (ou colorir condicionalmente) apenas quando houver 2+ instâncias na loja. O `InboxPage` passa `showOrigin: boolean` (true quando `accounts.length > 1`) e o `account` da conversa; o item renderiza:
```tsx
{showOrigin && originAccount && (
  <span aria-hidden className="absolute left-0 top-0 h-full w-[3px]" style={{ backgroundColor: instanceAccent(originAccount.id) }} />
)}
```
(Posicionar a faixa de status em `left-[3px]` quando a de origem estiver visível, para não sobrepor.)

- [ ] **Step 4: Build + verificação visual** — `bun run build`; o dono confirma: header com chip, composer com "Respondendo por", lista com faixa de cor só quando há 2+ instâncias; subtítulo do contato intacto.

- [ ] **Step 5: Commit**
```bash
git add src/features/conversations/components/ConversationHeader.tsx src/features/conversations/components/MessageInput.tsx src/features/conversations/components/ConversationListItem.tsx
git commit -m "feat: OriginChip in header, composer and list (multi-instance only)"
```

---

## Self-Review

**1. Spec coverage (§4 do spec):** Hub → Task 3 ✅; Adicionar número → Task 4 ✅; Configurar acesso → Task 5 ✅; Nova conversa (provider-aware, responsável=criador) → Task 6 ✅; OriginChip (3 contextos, fora do subtítulo, faixa na lista, só multi) → Tasks 1,7 ✅. Reconciliação #98 (mesmo chip, `formatPhone`, cor por id) ✅. Departamento bloqueado até 211 ✅.
**2. Placeholder scan:** helpers e `OriginChip` têm código completo + testes. Telas grandes trazem handlers/estado reais e pontos de integração exatos; o JSX puramente visual remete aos mockups validados (referência concreta, não "TBD"). Sem "TODO"/"tratar erros genérico".
**3. Type consistency:** `OriginChip` props (`account`, `variant`) idênticas onde usado; `provider.create`/`getAccessRules`/`replaceAccessRules` batem com o contrato do Plano 2; `resolveAccessRecipients` consome `{kind,targetValue}` e `{id,role,storeId}` coerentes com `IWhatsAppAccountAccessRule`/`ISeller`. `purpose` usado nos chips bate com `WhatsAppAccountPurpose`.
**Riscos / dependências externas:** (a) o `useEvolutionPairing` pode precisar do `POST /instance/create` na edge `whatsapp-connect` (Task 4 Step 2 cobre); (b) a criação de conversa na Task 6 assume um `create` no provider de conversations — confirmar/adicionar (mesmo padrão store-scoped do Plano 2); (c) UI de participante (Camada 2) fica como extensão pós-MVP.

---

## ✅ Resultado da execução (2026-06-15)

**Plano 4 executado integralmente** na branch `feat/whatsapp-multi-instancia`. Commits (7 — o 7º `e8a0dfc` é Task 6 + 7.3, detalhado abaixo):
- `ac531ce` — Task 1: `instanceAccent` + `OriginChip`
- `92e5f8e` — Task 2: `resolveAccessRecipients`
- `6098cfd` — Task 7 Step 1: `OriginChip` no header da conversa
- `ee44905` — Tasks 3+5: Hub (tokens, chip de finalidade, resumo de acesso) + `InstanceAccessSheet`
- `084f6ae` — Task 7 Step 2: faixa "Respondendo por" no composer
- `39400bc` — Task 4: `AddInstanceWizard` + `createInstance` na lib + ação `qr` da edge cria a instância (deployado)

**Adaptações vs. plano (código vivo):**
- Tasks 3/5: `ISeller` não tem `role` → editor de acesso oferece **loja + atendentes específicos** (contagem exata); **papel/departamento deferidos para PRD-211** (data model/RLS já suportam; regras existentes preservadas no replace).
- Task 4: fluxo real é `ConnectWhatsAppDialog`/`useEvolutionPairing` (não os hooks assumidos) e **não existia `createInstance`** — adicionado à lib + ação `qr` cria idempotente; número novo **herda a config de servidor** (baseUrl + credentialsRef = mesma apikey) de uma instância Evolution existente (spec: um servidor). `whatsapp-connect` redeployado.

**Task 6 + Task 7 Step 3 (commit `e8a0dfc`) — CONCLUÍDAS:**
- **Task 6 (Nova conversa):** método `createOutbound` (contrato + mock api + mock provider + supabase) — **insert direto** atribuído ao criador, sem distribuição. **Descoberta que dispensou prod:** a policy `conversations_insert` (WITH CHECK `store + (is_staff OR assigned = self)`) JÁ permite o vendedor inserir conversa auto-atribuída, e `conversations_select` (via `can_access_conversation`, braço do responsável) deixa ele vê-la → **sem RPC, sem migration, sem toque em prod**. `NewConversationDialog` (origem + busca de cliente existente + dica provider-aware); a 1ª mensagem é escrita no **composer existente** (já provider-aware) após navegar — evita reimplementar envio/template. Botão no `InboxHeader` (`onNewConversation`) + estado/render no `InboxPage`. **Contato 100% novo (não cadastrado) fica como refinamento** (passa pelo cadastro de Clientes).
- **Task 7 Step 3 (faixa de origem):** `ConversationListItem` ganhou `originAccount`/`showOrigin` (faixa de cor por instância à esquerda, status desloca p/ `left-[3px]`); `InboxPage` carrega as contas, monta o mapa e ativa `showOrigin` quando há 2+ instâncias.

**PLANO 4 COMPLETO (7 commits).** Gate: build OK · test **692/692 (86 arquivos)** · código novo type-clean (tsc filtrado só mostra baseline pré-existente: `search:(prev)=>prev` do router etc.).

**Smokes pendentes (dono):** wizard "Adicionar número" com servidor Evolution real; editor de acesso (salvar/reabrir); nova conversa (criar → compor → enviar).
