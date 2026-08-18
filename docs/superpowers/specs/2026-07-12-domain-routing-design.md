# Rotas dedicadas por domínio e subdomínio — design

**Data:** 2026-07-12
**Branch:** `docs/dintec-import-spec` (documento de design apenas — implementação fica para um plano/branch próprios)

## Contexto

O app é uma SPA estática (Vite + TanStack Router, sem SSR) hospedada na Vercel. O `vercel.json` faz um único rewrite (`/(.*) → /index.html`) e o projeto já tem dois domínios cadastrados na Vercel — `crm.gallobasediesel.com.br` e `pwa.gallobasediesel.com.br` — mas **nenhuma lógica os diferencia**: os dois servem o mesmo bundle e a mesma árvore de rotas completa, sem qualquer roteamento por host.

O código já organiza as rotas por prefixo de arquivo (`app.*`, `auth.*`, `loja.*`, `portal.*`, `pwa.*` em `src/routes/`), refletindo as 4 áreas do produto:

- **CRM/staff** (`app.*` + `auth.*`) — Owner/Vendedor logados, autenticação real via Supabase Auth.
- **Loja** (`loja.*`) — storefront B2C, clientes finais. Sessão própria e isolada em `localStorage` (`gallo-storefront-customer-auth`, `customerAuthStore.ts`).
- **Portal** (`portal.*`) — portal B2B. Sessão própria (`portalAuthStore.ts`).
- **PWA** (`pwa.*`) — vendedor externo. Sessão própria (`pwaAuthStore.ts`).

Cada uma dessas três últimas áreas já resolve seu próprio gate de autenticação na raiz (`pwa.index.tsx`/`portal.index.tsx` redirecionam para login ou home própria; `loja.index.tsx` renderiza a home pública direto), sem depender da lógica de `src/routes/index.tsx` (essa é específica do CRM: redireciona por papel — não autenticado → `/auth/login`, Owner/Vendedor → `/app/inicio`, Cliente → `/loja`).

## Objetivo desta entrega

Cada área do produto passa a ter seu próprio subdomínio dedicado, com **URLs limpas** (sem o prefixo de arquivo aparecendo na barra de endereço):

| Host | Área | Exemplo de URL visível |
|---|---|---|
| `crm.gallobasediesel.com.br` | CRM/staff (`app.*`, `auth.*`) | `crm.gallobasediesel.com.br/clientes` (hoje: `/app/clientes`) |
| `loja.gallobasediesel.com.br` | Storefront B2C (`loja.*`) | `loja.gallobasediesel.com.br/carrinho` (hoje: `/loja/carrinho`) |
| `portal.gallobasediesel.com.br` | Portal B2B (`portal.*`) | `portal.gallobasediesel.com.br/pedidos` (hoje: `/portal/pedidos`) |
| `pwa.gallobasediesel.com.br` | PWA vendedor externo (`pwa.*`) | `pwa.gallobasediesel.com.br/carteira` (hoje: `/pwa/carteira`) |
| `gallobasediesel.com.br` (domínio nu) | — | redireciona (308, preservando path/query) para `crm.gallobasediesel.com.br` |

Fora de escopo (confirmado com o dono): build/deploy separado por área, isolamento de identidade visual por domínio, SSR, marketing site na raiz.

## Por que não dá para resolver só com config da Vercel

Como é tudo roteado no cliente (TanStack Router lê `window.location.pathname` depois que o bundle já carregou), um rewrite do lado do servidor não consegue "esconder" o prefixo em deep links — ele só decide qual arquivo estático servir, e hoje **todo** caminho já cai no mesmo `index.html`. Um redirect por host resolveria só a tela inicial (`/` → `/pwa`), mas `pwa.gallobasediesel.com.br/carteira` continuaria dando 404 sem prefixo. A solução real precisa acontecer no boot do app: ele precisa saber, a partir do host, qual prefixo aplicar internamente.

## Design

### 1. Vercel — domínios

Adicionar `loja.gallobasediesel.com.br` e `portal.gallobasediesel.com.br` ao projeto `gallo-basediesel` (`crm.*` e `pwa.*` já existem). Domínio nu `gallobasediesel.com.br` ganha um redirect 308 preservando path/query para `crm.gallobasediesel.com.br`, configurado no painel de domínios da Vercel (sem precisar mexer no `vercel.json`).

`vercel.json` permanece inalterado — o rewrite genérico atual (`/(.*) → /index.html`) já cobre todos os hosts.

### 2. Mapeamento host → prefixo

Novo módulo, ex. `src/shared/lib/hostRouting.ts`, com uma tabela estática:

```ts
const HOST_PREFIXES: Record<string, string> = {
  "pwa.gallobasediesel.com.br": "/pwa",
  "portal.gallobasediesel.com.br": "/portal",
  "loja.gallobasediesel.com.br": "/loja",
};

export function getHostPrefix(hostname: string): string {
  return HOST_PREFIXES[hostname] ?? "";
}
```

Qualquer host não listado (`crm.gallobasediesel.com.br`, `*.vercel.app`, `localhost` em dev) resolve para prefixo vazio — comportamento atual, inalterado. Isso significa que **dev local continua funcionando exatamente como hoje**, acessando `/app`, `/loja`, `/portal`, `/pwa` diretamente pela URL.

### 3. History virtual (`src/router.tsx`)

`createRouter` passa a receber um `history` customizado construído com `createBrowserHistory({ parseLocation, createHref })` (extensão já suportada pela lib — é o mesmo mecanismo que `createHashHistory` usa internamente):

- **`parseLocation`**: lê o pathname real do navegador e **acrescenta** o prefixo do host antes de entregar para o router (ex.: host `pwa.*` + pathname `/carteira` → o router enxerga `/pwa/carteira`, que já casa com a rota de arquivo existente).
- **`createHref`**: recebe o href interno que o router gerou (ex. `/pwa/carteira`, produzido por um `<Link to="/pwa/carteira">` ou por um `redirect({ to: "/pwa/login" })`) e **remove** o prefixo antes de escrever na barra de endereço — o usuário só vê `/carteira` ou `/login`.

Como `queueHistoryAction` (dentro da própria lib) já centraliza toda escrita de URL (push e replace) através de `createHref`, isso cobre navegação por `<Link>`, `router.navigate`, e `redirect()` de forma consistente, sem precisar tocar em nenhum dos ~150 arquivos de rota.

### 4. Áreas não tocadas

- Nenhuma mudança em arquivos de rota (`pwa.*.tsx`, `portal.*.tsx`, `loja.*.tsx`, `app.*.tsx`, `auth.*.tsx`).
- Nenhuma mudança em `AuthProvider`, nos stores de sessão por área (`pwaAuthStore`, `portalAuthStore`, `customerAuthStore`), nem em `src/routes/index.tsx`.
- `vercel.json` inalterado.

### 5. Sessões por área — por que a separação de origem não quebra nada

`localStorage` é isolado por origem (esquema + host + porta). Hoje, com todas as áreas num único domínio, isso já não causa nenhum compartilhamento indevido — cada área usa sua própria chave (`gallo-storefront-customer-auth`, etc.) e nenhuma lê a chave da outra. Ao mover cada área para seu próprio subdomínio, essas sessões continuam 100% funcionais dentro da própria origem; a única mudança é que elas deixam de coexistir (o que nunca foi necessário) em favor de viverem exclusivamente no host da sua área.

O único ponto que merece atenção: **links que hoje apontam para um caminho com prefixo esperando abrir no domínio único** (ex.: e-mail de convite, e-mail de redefinição de senha, link de retomada de carrinho) precisam passar a apontar para `https://<host-da-área>/<caminho-sem-prefixo>` em vez de `https://crm.gallobasediesel.com.br/<área>/<caminho>`.

### 6. Riscos / pontos a validar na implementação

- **Navegação hardcoded fora do router** (`window.location.href = "/pwa/algo"`, `<a href="/portal/...">` cru) precisa ser levantada e corrigida — essas não passam pelo `createHref` customizado e vazariam o prefixo na URL. Levantamento fica para o plano de implementação.
- **Links gerados fora do app** (e-mails transacionais, mensagens de WhatsApp com link de retomada, etc.) que hoje montam URL com prefixo de área precisam ser atualizados para o host dedicado.
- **Teste real de subdomínio** exige um preview deploy na Vercel com os domínios configurados (ou editar `hosts` localmente) — não dá para validar 100% rodando só `bun run dev`, já que isso depende do `hostname` real resolvido pelo navegador.
- **SEO/canonical da Loja**: como o storefront B2C é o único com relevância de SEO, vale conferir (fora de escopo desta entrega, só um alerta) se há alguma tag `canonical`/sitemap hardcoded com o domínio antigo.

### 7. Rollout

- Sem migration, sem Edge Function nova.
- Mudança de infraestrutura: 2 domínios novos + 1 redirect na Vercel (ação do dono/admin do projeto).
- Mudança de código: 1 módulo novo (`hostRouting.ts`) + ajuste em `src/router.tsx` para injetar o `history` customizado + auditoria de links hardcoded (item 6).
- Sem mudança de rota, sem mudança de schema, sem mudança de RLS.
