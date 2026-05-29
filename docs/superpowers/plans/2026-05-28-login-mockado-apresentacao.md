# Login mockado para apresentação — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Elevar a tela `/auth/login` para um split-screen com painel de marca + login híbrido (form mockado + perfis de acesso rápido), e popular o roster de usuários com as pessoas reais da GALLO em todo o app.

**Architecture:** O painel de marca e o card-botão de perfil viram componentes focados em `src/features/auth/`. O `AuthLayout` vira um wrapper full-height; o login compõe `BrandPanel` + form + grade de `ProfileCard`. O roster real entra renomeando os campos de exibição dos sellers no seed (IDs mantidos estáveis para não tocar nas ~10 referências hardcoded) e reescrevendo `MOCK_USERS`.

**Tech Stack:** React + TanStack Router (file-based) + Tailwind CSS v4 + shadcn/ui (new-york) + Iconify. Sem SSR.

**Spec:** `docs/superpowers/specs/2026-05-28-login-mockado-apresentacao-design.md`

> **Nota sobre verificação (sem suíte de testes):** o projeto não tem test runner. A verificação de cada task é **`bun run lint`** + leitura do diff; a verificação final é **`bun run build`** (type-check + build de produção) + **`bun run lint`** + um **checklist manual** que o usuário executa no browser (o usuário valida a UI manualmente — não abrir preview automatizado). Não há passos de teste unitário.

---

## File Structure

- `src/mocks/data/seedSellers.ts` _(modificar)_ — renomeia 4 sellers para nomes reais, adiciona 2 (Ramon, Welligton), atualiza `SEED_VENDEDOR_SELLER_IDS`. IDs estáveis.
- `src/features/auth/mock-users.ts` _(modificar)_ — adiciona `displayRole?` e `group` a `IMockUserProfile`; reescreve `MOCK_USERS` com 8 perfis; helper de busca por e-mail.
- `src/features/auth/BrandPanel.tsx` _(criar)_ — painel de marca (logo, tagline, marca d'água industrial, selos de submarca).
- `src/features/auth/ProfileCard.tsx` _(criar)_ — card-botão acessível de um perfil de demonstração.
- `src/features/shell/layouts/AuthLayout.tsx` _(modificar)_ — wrapper full-height (remove o cabeçalho centralizado com logo, que migra para o `BrandPanel`).
- `src/routes/auth.login.tsx` _(modificar)_ — composição split-screen: `BrandPanel` + form híbrido + grades de `ProfileCard` + acesso AILA discreto.

**Fora de escopo:** `loja.login`, `pwa.login`, `portal.login`.

---

### Task 1: Roster real no seed de sellers

**Files:**

- Modify: `src/mocks/data/seedSellers.ts`

- [ ] **Step 1: Substituir o conteúdo do arquivo**

Substitua TODO o conteúdo de `src/mocks/data/seedSellers.ts` por:

```ts
import type { ISeller } from "@/shared/types";
import { SEED_STORE_ID } from "./seedStore";

/**
 * Fixed seller roster. The first five are internal staff; the sixth is an
 * external field rep. IDs are stable strings referenced across the mock
 * generators and a few feature pages, so they are kept unchanged even though
 * the display names now map to the real GALLO team — only `fullName`/`email`
 * move.
 *
 * `seller-joao-gallo` is the Owner (Fernando); `seller-marina-cardoso` is a
 * synthetic Gestor kept around so the role can be demoed.
 */
export const SEED_SELLERS: ISeller[] = [
  {
    id: "seller-joao-gallo",
    storeId: SEED_STORE_ID,
    fullName: "Fernando Mello Muniz Gallo",
    email: "fernando@gallobasediesel.com.br",
    phone: "(55) 99800-0001",
    type: "internal",
    availability: "online",
    divisions: ["parts"],
    active: true,
    createdAt: "2026-01-01T08:00:00.000Z",
  },
  {
    id: "seller-carlos-santos",
    storeId: SEED_STORE_ID,
    fullName: "Lucas Costa",
    email: "lucas@gallobasediesel.com.br",
    phone: "(55) 99800-0002",
    type: "internal",
    availability: "online",
    divisions: ["parts"],
    active: true,
    createdAt: "2026-01-05T08:00:00.000Z",
  },
  {
    id: "seller-marina-cardoso",
    storeId: SEED_STORE_ID,
    fullName: "Marina Cardoso",
    email: "marina@gallobasediesel.com.br",
    phone: "(55) 99800-0003",
    type: "internal",
    availability: "ausente",
    divisions: ["parts"],
    active: true,
    createdAt: "2026-01-10T08:00:00.000Z",
  },
  {
    id: "seller-rafael-lima",
    storeId: SEED_STORE_ID,
    fullName: "Cauan Bulegon",
    email: "caua@gallobasediesel.com.br",
    phone: "(55) 99800-0004",
    type: "internal",
    availability: "ocupado",
    divisions: ["parts"],
    active: true,
    createdAt: "2026-01-12T08:00:00.000Z",
  },
  {
    id: "seller-ramon-schimidt",
    storeId: SEED_STORE_ID,
    fullName: "Ramon Schimidt",
    email: "ramon@gallobasediesel.com.br",
    phone: "(55) 99800-0005",
    type: "internal",
    availability: "online",
    divisions: ["parts"],
    active: true,
    createdAt: "2026-01-15T08:00:00.000Z",
  },
  {
    id: "seller-welligton-nunes",
    storeId: SEED_STORE_ID,
    fullName: "Welligton Nunes",
    email: "welligton@gallobasediesel.com.br",
    phone: "(55) 99800-0006",
    type: "external",
    availability: "online",
    region: "Noroeste RS",
    commissionTier: "pleno",
    divisions: ["parts"],
    active: true,
    createdAt: "2026-01-18T08:00:00.000Z",
  },
];

export const SEED_SELLER_IDS: string[] = SEED_SELLERS.map((s) => s.id);

/** The owner is the seller whose role on `mock-users.ts` is `Owner`. */
export const SEED_OWNER_ID = "seller-joao-gallo";

/**
 * Sellers eligible to receive customer wallets (carteira 1:1).
 * The Owner (Fernando) and the synthetic Gestor (Marina) may hold customers,
 * but newcomers should always land on the vendedores roster below.
 */
export const SEED_VENDEDOR_SELLER_IDS: string[] = [
  "seller-carlos-santos",
  "seller-rafael-lima",
  "seller-ramon-schimidt",
  "seller-welligton-nunes",
];
```

- [ ] **Step 2: Verificar lint + type-check**

Run: `bun run lint`
Expected: sem erros novos no arquivo.

Run: `bun run build`
Expected: build conclui sem erro de tipo (os geradores que iteram sobre `SEED_SELLERS` aceitam o roster de 6).

- [ ] **Step 3: Commit**

```bash
git add src/mocks/data/seedSellers.ts
git commit -m "feat(mock): seed real GALLO seller roster (4->6) keeping stable ids"
```

---

### Task 2: Perfis de login reais (`MOCK_USERS`)

**Files:**

- Modify: `src/features/auth/mock-users.ts`

- [ ] **Step 1: Adicionar campos `displayRole` e `group` à interface**

Em `src/features/auth/mock-users.ts`, dentro de `interface IMockUserProfile`, logo após a linha `role: RoleName;`, adicione:

```ts
  /**
   * Optional display-only label that overrides `role` on the login card.
   * Used for profiles whose RBAC role doesn't match their shown title — e.g.
   * the AILA admin runs with `Owner` permissions but is labeled "Admin · AILA".
   */
  displayRole?: string;
  /** Visual grouping on the login screen. */
  group: "team" | "client" | "admin";
```

- [ ] **Step 2: Reescrever a constante `MOCK_USERS`**

Substitua o array `export const MOCK_USERS: IMockUserProfile[] = [ ... ];` inteiro (da linha `export const MOCK_USERS` até o `];` que o fecha) por:

```ts
export const MOCK_USERS: IMockUserProfile[] = [
  {
    id: "mock-owner",
    role: "Owner",
    group: "team",
    displayName: "Fernando Mello Muniz Gallo",
    email: "fernando@gallobasediesel.com.br",
    storeLabel: "GALLO Matriz",
    avatarInitials: "FG",
    description: "CEO e fundador — visão completa da operação.",
    defaultRedirect: "/app/inicio",
    storeId: MATRIZ_STORE_ID,
    accessibleStoreIds: [MATRIZ_STORE_ID],
    sellerId: "seller-joao-gallo",
  },
  {
    id: "mock-gestor",
    role: "Gestor",
    group: "team",
    displayName: "Marina Cardoso",
    email: "marina@gallobasediesel.com.br",
    storeLabel: "GALLO Matriz",
    avatarInitials: "MC",
    description: "Gestora da loja — equipe, carteira e operação diária.",
    defaultRedirect: "/app/inicio",
    storeId: MATRIZ_STORE_ID,
    accessibleStoreIds: [MATRIZ_STORE_ID],
    sellerId: "seller-marina-cardoso",
  },
  {
    id: "mock-vendedor-lucas",
    role: "Vendedor",
    group: "team",
    displayName: "Lucas Costa",
    email: "lucas@gallobasediesel.com.br",
    storeLabel: "GALLO Matriz",
    avatarInitials: "LC",
    description: "Vendedor interno — Central de Atendimento e carteira.",
    defaultRedirect: "/app/atendimento",
    storeId: MATRIZ_STORE_ID,
    accessibleStoreIds: [MATRIZ_STORE_ID],
    sellerId: "seller-carlos-santos",
  },
  {
    id: "mock-vendedor-cauan",
    role: "Vendedor",
    group: "team",
    displayName: "Cauan Bulegon",
    email: "caua@gallobasediesel.com.br",
    storeLabel: "GALLO Matriz",
    avatarInitials: "CB",
    description: "Vendedor interno — Central de Atendimento e carteira.",
    defaultRedirect: "/app/atendimento",
    storeId: MATRIZ_STORE_ID,
    accessibleStoreIds: [MATRIZ_STORE_ID],
    sellerId: "seller-rafael-lima",
  },
  {
    id: "mock-vendedor-ramon",
    role: "Vendedor",
    group: "team",
    displayName: "Ramon Schimidt",
    email: "ramon@gallobasediesel.com.br",
    storeLabel: "GALLO Matriz",
    avatarInitials: "RS",
    description: "Vendedor interno — Central de Atendimento e carteira.",
    defaultRedirect: "/app/atendimento",
    storeId: MATRIZ_STORE_ID,
    accessibleStoreIds: [MATRIZ_STORE_ID],
    sellerId: "seller-ramon-schimidt",
  },
  {
    id: "mock-vendedor-externo",
    role: "VendedorExterno",
    group: "team",
    displayName: "Welligton Nunes",
    email: "welligton@gallobasediesel.com.br",
    storeLabel: "GALLO Matriz",
    avatarInitials: "WN",
    description: "Vendedor externo — campo e carteira regional.",
    defaultRedirect: "/app/atendimento",
    storeId: MATRIZ_STORE_ID,
    accessibleStoreIds: [MATRIZ_STORE_ID],
    sellerId: "seller-welligton-nunes",
  },
  {
    id: "mock-cliente",
    role: "Cliente",
    group: "client",
    displayName: "Transportadora Aurora Ltda",
    email: "aurora@cliente.com.br",
    storeLabel: "Cliente B2B",
    avatarInitials: "TA",
    description: "Cliente B2B — vitrine pública e portal.",
    defaultRedirect: "/loja",
    storeId: MATRIZ_STORE_ID,
  },
  {
    id: "mock-admin-aila",
    role: "Owner",
    group: "admin",
    displayRole: "Admin · AILA",
    displayName: "Edmilson Souza",
    email: "admin@ailainteligente.com",
    storeLabel: "AILA · Suporte",
    avatarInitials: "ES",
    description: "Suporte AILA — acesso técnico total à plataforma.",
    defaultRedirect: "/app/inicio",
    storeId: MATRIZ_STORE_ID,
    accessibleStoreIds: [MATRIZ_STORE_ID],
  },
];
```

> **Nota:** `IMockUserProfile` já tem `email`? Verifique: se NÃO existir o campo `email` na interface, adicione `email: string;` logo após `role`/`displayRole`. (A interface atual lida em exploração não tinha `email` — adicione-o.)

- [ ] **Step 3: Garantir o campo `email` na interface**

Confirme que `interface IMockUserProfile` contém `email: string;`. Se não, adicione após `group`:

```ts
/** E-mail usado pelo form de login híbrido para casar o perfil. */
email: string;
```

- [ ] **Step 4: Adicionar helper de busca por e-mail**

No final do arquivo, após a linha `export const LOCALSTORAGE_USER_KEY = "gallo-mock-user";`, adicione:

```ts
/** Finds a profile whose email matches (case-insensitive, trimmed). */
export function findMockUserByEmail(email: string): IMockUserProfile | undefined {
  const normalized = email.trim().toLowerCase();
  return MOCK_USERS.find((u) => u.email.toLowerCase() === normalized);
}
```

- [ ] **Step 5: Verificar lint + type-check**

Run: `bun run lint`
Expected: sem erros.

Run: `bun run build`
Expected: build conclui. Se algum consumidor de `MOCK_USERS` exigir `group`/`email`, o type-check aponta — corrija conforme o erro.

- [ ] **Step 6: Commit**

```bash
git add src/features/auth/mock-users.ts
git commit -m "feat(auth): real GALLO login profiles with group + displayRole"
```

---

### Task 3: Componente `BrandPanel`

**Files:**

- Create: `src/features/auth/BrandPanel.tsx`

- [ ] **Step 1: Criar o arquivo**

Crie `src/features/auth/BrandPanel.tsx` com:

```tsx
import { Logo } from "@/components/Logo";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";

const SUBMARCAS: { label: string; dot: string }[] = [
  { label: "PARTS", dot: "bg-emerald-500" },
  { label: "SERVICE", dot: "bg-red-500" },
  { label: "INDUSTRIAL", dot: "bg-amber-500" },
];

/**
 * Brand panel shown on the left of the login split-screen (md+ only).
 * Pure presentation — no props. Uses semantic tokens + Tailwind palette dots.
 */
export function BrandPanel({ className }: { className?: string }) {
  return (
    <aside
      className={cn(
        "relative hidden overflow-hidden border-r border-border bg-card md:flex md:flex-col md:justify-between md:p-10 lg:p-12",
        className,
      )}
    >
      {/* marca d'água industrial */}
      <Icon
        icon="mdi:truck-cargo"
        className="pointer-events-none absolute -right-10 bottom-0 text-foreground opacity-[0.04]"
        size={420}
        aria-hidden
      />
      <div
        className="absolute inset-0 bg-gradient-to-br from-card to-background opacity-60"
        aria-hidden
      />

      <div className="relative">
        <Logo variant="horizontal" className="h-10" />
      </div>

      <div className="relative max-w-sm space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
          Plataforma de inteligência comercial
        </p>
        <h2 className="text-3xl font-bold leading-tight tracking-tight text-foreground">
          O cérebro comercial acima do ERP.
        </h2>
        <p className="text-sm text-muted-foreground">
          Carteira, atendimento e metas em um só lugar — pensado para distribuição de peças pesadas.
        </p>
      </div>

      <div className="relative flex items-center gap-4">
        {SUBMARCAS.map((s) => (
          <div key={s.label} className="flex items-center gap-1.5">
            <span className={cn("h-2 w-2 rounded-full", s.dot)} aria-hidden />
            <span className="text-[11px] font-semibold tracking-wider text-muted-foreground">
              {s.label}
            </span>
          </div>
        ))}
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: Verificar lint**

Run: `bun run lint`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/features/auth/BrandPanel.tsx
git commit -m "feat(auth): add BrandPanel for login split-screen"
```

---

### Task 4: Componente `ProfileCard`

**Files:**

- Create: `src/features/auth/ProfileCard.tsx`

- [ ] **Step 1: Criar o arquivo**

Crie `src/features/auth/ProfileCard.tsx` com:

```tsx
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import type { IMockUserProfile } from "./mock-users";

/** Side accent color per role (Tailwind palette — decorative only). */
const ROLE_ACCENT: Record<string, string> = {
  Owner: "bg-primary",
  Gestor: "bg-sky-500",
  Vendedor: "bg-emerald-500",
  VendedorExterno: "bg-amber-500",
  SDR: "bg-cyan-500",
  Financeiro: "bg-rose-500",
  Cliente: "bg-violet-500",
};

interface IProfileCardProps {
  profile: IMockUserProfile;
  index: number;
  pending: boolean;
  onSelect: (id: string) => void;
}

export function ProfileCard({ profile, index, pending, onSelect }: IProfileCardProps) {
  const accent = ROLE_ACCENT[profile.role] ?? "bg-border";
  const roleLabel = profile.displayRole ?? profile.role;
  const isOwner = profile.role === "Owner" && profile.group === "team";

  return (
    <button
      type="button"
      onClick={() => onSelect(profile.id)}
      disabled={pending}
      aria-label={`Entrar como ${profile.displayName}, ${roleLabel}`}
      style={{ animationDelay: `${index * 40}ms` }}
      className={cn(
        "group relative flex w-full min-h-[44px] items-center gap-4 overflow-hidden rounded-lg border border-border bg-card p-4 text-left",
        "transition-colors duration-200 hover:border-primary/60 hover:bg-accent",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:fill-mode-both",
        "disabled:cursor-not-allowed disabled:opacity-60",
      )}
    >
      <span className={cn("absolute inset-y-0 left-0 w-[3px]", accent)} aria-hidden />

      <Avatar className="h-12 w-12 ring-2 ring-border">
        <AvatarFallback
          className={cn(
            "text-sm font-semibold",
            isOwner
              ? "bg-primary text-primary-foreground"
              : "bg-secondary text-secondary-foreground",
          )}
        >
          {profile.avatarInitials}
        </AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-foreground">{profile.displayName}</p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <Badge variant="secondary" className="text-[10px]">
            {roleLabel}
          </Badge>
          <span className="truncate text-xs text-muted-foreground">{profile.storeLabel}</span>
        </div>
        <p className="mt-1 truncate text-xs text-muted-foreground">{profile.description}</p>
      </div>

      <Icon
        icon={pending ? "lucide:loader-2" : "lucide:arrow-right"}
        size={18}
        className={cn(
          "shrink-0 text-muted-foreground transition-transform duration-200",
          pending ? "animate-spin" : "group-hover:translate-x-1 group-hover:text-primary",
        )}
        aria-hidden
      />
    </button>
  );
}
```

- [ ] **Step 2: Verificar lint + type-check**

Run: `bun run lint`
Expected: sem erros (importa `IMockUserProfile` que já tem `displayRole`/`group` da Task 2).

- [ ] **Step 3: Commit**

```bash
git add src/features/auth/ProfileCard.tsx
git commit -m "feat(auth): add accessible ProfileCard button for demo profiles"
```

---

### Task 5: `AuthLayout` vira wrapper full-height

**Files:**

- Modify: `src/features/shell/layouts/AuthLayout.tsx`

- [ ] **Step 1: Substituir o conteúdo do arquivo**

Substitua TODO o conteúdo de `src/features/shell/layouts/AuthLayout.tsx` por:

```tsx
import { Outlet } from "@tanstack/react-router";

/**
 * Full-height wrapper for /auth/*. The login route owns its own split-screen
 * composition (BrandPanel + form); simpler /auth pages (logout) just render
 * centered content inside `children`.
 */
export function AuthLayout({ children }: { children?: React.ReactNode }) {
  return <div className="min-h-screen bg-background text-foreground">{children ?? <Outlet />}</div>;
}
```

- [ ] **Step 2: Verificar que `/auth/logout` ainda renderiza**

Run: `bun run lint`
Expected: sem erros. (O logout não dependia do cabeçalho com logo; renderiza dentro do wrapper.)

- [ ] **Step 3: Commit**

```bash
git add src/features/shell/layouts/AuthLayout.tsx
git commit -m "refactor(shell): AuthLayout becomes full-height wrapper"
```

---

### Task 6: Tela de login split-screen + híbrida

**Files:**

- Modify: `src/routes/auth.login.tsx`

- [ ] **Step 1: Substituir o conteúdo do arquivo**

Substitua TODO o conteúdo de `src/routes/auth.login.tsx` por:

```tsx
import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Icon } from "@/components/Icon";
import { useAuth } from "@/features/auth/useAuth";
import { MOCK_USERS, findMockUserByEmail } from "@/features/auth/mock-users";
import { BrandPanel } from "@/features/auth/BrandPanel";
import { ProfileCard } from "@/features/auth/ProfileCard";

const searchSchema = z.object({
  next: z.string().optional(),
});

export const Route = createFileRoute("/auth/login")({
  validateSearch: searchSchema,
  component: LoginPage,
});

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function LoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const { next } = Route.useSearch();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const enter = (id: string) => {
    setPendingId(id);
    const profile = signIn(id);
    if (!profile) {
      setError("Perfil não encontrado.");
      setPendingId(null);
      return;
    }
    const target = next ?? profile.defaultRedirect;
    void navigate({ to: target });
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (!EMAIL_REGEX.test(email.trim())) {
      setError("Informe um e-mail válido.");
      return;
    }
    const profile = findMockUserByEmail(email);
    if (!profile) {
      setError("E-mail não reconhecido. Use um perfil de demonstração abaixo.");
      return;
    }
    enter(profile.id);
  };

  const teamProfiles = MOCK_USERS.filter((u) => u.group === "team");
  const clientProfiles = MOCK_USERS.filter((u) => u.group === "client");
  const adminProfiles = MOCK_USERS.filter((u) => u.group === "admin");

  return (
    <div className="grid min-h-screen md:grid-cols-[45%_1fr]">
      <BrandPanel />

      <main className="flex flex-col justify-center px-5 py-10 sm:px-8 md:px-12 lg:px-16">
        <div className="mx-auto w-full max-w-xl space-y-8">
          {/* cabeçalho */}
          <header className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
              Plataforma de inteligência comercial
            </p>
            <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              Acesse a plataforma
            </h1>
            <p className="text-sm text-muted-foreground">
              Esta autenticação é mockada — para demonstração.
            </p>
          </header>

          {/* form realista (mockado) */}
          <form className="space-y-4" onSubmit={handleSubmit} noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="login-email">E-mail</Label>
              <Input
                id="login-email"
                type="email"
                autoComplete="email"
                placeholder="voce@gallobasediesel.com.br"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-invalid={Boolean(error)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="login-password">Senha</Label>
              <Input
                id="login-password"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {error && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                {error}
              </div>
            )}
            <Button type="submit" size="lg" className="w-full" disabled={pendingId !== null}>
              Entrar
              <Icon icon="lucide:log-in" size={16} className="ml-2" aria-hidden />
            </Button>
          </form>

          {/* divisor */}
          <div className="flex items-center gap-3">
            <span className="h-px flex-1 bg-border" aria-hidden />
            <span className="text-xs text-muted-foreground">
              ou entre como perfil de demonstração
            </span>
            <span className="h-px flex-1 bg-border" aria-hidden />
          </div>

          {/* equipe GALLO */}
          <section className="space-y-3" aria-label="Perfis da equipe GALLO">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Equipe GALLO
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {teamProfiles.map((profile, i) => (
                <ProfileCard
                  key={profile.id}
                  profile={profile}
                  index={i}
                  pending={pendingId === profile.id}
                  onSelect={enter}
                />
              ))}
            </div>
          </section>

          {/* cliente B2B */}
          {clientProfiles.length > 0 && (
            <section className="space-y-3" aria-label="Perfil de cliente">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Cliente
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {clientProfiles.map((profile, i) => (
                  <ProfileCard
                    key={profile.id}
                    profile={profile}
                    index={teamProfiles.length + i}
                    pending={pendingId === profile.id}
                    onSelect={enter}
                  />
                ))}
              </div>
            </section>
          )}

          {/* acesso AILA discreto */}
          {adminProfiles.map((profile) => (
            <div key={profile.id} className="border-t border-border pt-4">
              <button
                type="button"
                onClick={() => enter(profile.id)}
                disabled={pendingId !== null}
                className="text-xs text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline disabled:opacity-60"
              >
                Acesso {profile.storeLabel} ({profile.displayName})
              </button>
            </div>
          ))}

          <p className="text-xs text-muted-foreground">
            Esta é uma fase de mockup. Autenticação real será habilitada na Fase 2 (Supabase Auth).
          </p>
        </div>
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Verificar lint + type-check + build**

Run: `bun run lint`
Expected: sem erros.

Run: `bun run build`
Expected: build de produção conclui sem erro de tipo.

- [ ] **Step 3: Commit**

```bash
git add src/routes/auth.login.tsx
git commit -m "feat(auth): split-screen hybrid login (form + grouped demo profiles)"
```

---

### Task 7: Verificação final + checklist manual

**Files:** nenhum (verificação).

- [ ] **Step 1: Lint + build limpos**

Run: `bun run lint`
Expected: 0 erros.

Run: `bun run build`
Expected: build conclui sem erros.

- [ ] **Step 2: Checklist manual (usuário roda `bun run dev` e valida no browser)**

Apresentar este checklist ao usuário para validação manual (em dark mode):

- [ ] `/auth/login` mostra painel de marca à esquerda (≥ md) e login à direita.
- [ ] Digitar `fernando@gallobasediesel.com.br` + qualquer senha → entra como Owner e vai para `/app/inicio`.
- [ ] Digitar um e-mail desconhecido → erro inline "E-mail não reconhecido…".
- [ ] Os 6 cards da Equipe GALLO aparecem (Fernando, Marina, Lucas, Cauan, Ramon, Welligton) + 1 card Cliente (Aurora).
- [ ] O acesso "Admin · AILA (Edmilson Souza)" aparece discreto no rodapé.
- [ ] Clicar num card loga e redireciona corretamente (vendedores → `/app/atendimento`, owner/gestor → `/app/inicio`, cliente → `/loja`).
- [ ] Navegação por teclado: Tab foca cada card, Enter/Espaço aciona, foco visível.
- [ ] Mobile (< md): painel de marca some, conteúdo empilha em 1 coluna.
- [ ] No app logado, rankings/carteira/comissões exibem os nomes reais (ex.: ranking lista Lucas, Cauan, Ramon, Welligton; gestão mostra Fernando como owner).

- [ ] **Step 3: (Opcional) Commit do spec/plan se ainda não versionados**

Se o usuário aprovar, versionar os documentos:

```bash
git add docs/superpowers/specs/2026-05-28-login-mockado-apresentacao-design.md docs/superpowers/plans/2026-05-28-login-mockado-apresentacao.md
git commit -m "docs(superpowers): spec + plan for mocked presentation login"
```

---

## Self-Review (preenchido pelo autor do plano)

**Cobertura da spec:**

- Split-screen + BrandPanel → Tasks 3, 6. ✅
- Form híbrido (e-mail casa perfil / erro inline) → Task 6. ✅
- Cards-botão acessíveis com accent por papel → Task 4. ✅
- 8 perfis (equipe + cliente + AILA discreto) → Tasks 2, 6. ✅
- Roster real no app inteiro (seed 4→6) → Task 1. ✅
- `displayRole`/`group` → Task 2. ✅
- AuthLayout wrapper → Task 5. ✅
- Apenas tokens semânticos (+ paleta Tailwind decorativa, padrão já usado no projeto) → Tasks 3,4,6. ✅
- Critérios de aceite → checklist Task 7. ✅

**Placeholders:** nenhum "TBD/TODO"; todo código é completo. A única condicional ("se a interface não tiver `email`") tem instrução explícita de adição (Task 2, Steps 2–3).

**Consistência de tipos:** `findMockUserByEmail` (Task 2) é consumida na Task 6; `IMockUserProfile.displayRole`/`group`/`email` (Task 2) são consumidos por `ProfileCard` (Task 4) e pela tela (Task 6); `BrandPanel`/`ProfileCard` exportam nomes usados nos imports da Task 6. IDs de seller usados em `MOCK_USERS` (Task 2) existem em `SEED_SELLERS` (Task 1).
