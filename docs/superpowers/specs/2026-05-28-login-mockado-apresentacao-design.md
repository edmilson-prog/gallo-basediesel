# Login mockado para apresentação — Design

**Data:** 2026-05-28
**Status:** Aprovado (aguardando revisão da spec)
**Contexto:** Fase 1 (Frontend First). Autenticação real só na Fase 2 (Supabase Auth).

## Objetivo

Elevar a tela de login mockada (`/auth/login`) de um "seletor de fixtures" para uma tela
com cara de produto pronto, usada em apresentação ao cliente, e popular o roster de
usuários com as pessoas reais da GALLO BASE DIESEL para gerar familiaridade na demo —
tanto na tela de login quanto no app inteiro (rankings, carteira, comissões, dashboards).

## Decisões (alinhadas com o usuário)

1. **Roster:** pessoas reais + um Gestor e um Cliente B2B sintéticos (para demonstrar esses papéis).
2. **Padrão de login:** híbrido — form realista (e-mail + senha mockados) + acesso rápido a perfis demo.
3. **Perfil Admin AILA (Edmilson):** visível, porém com tratamento discreto/separado.
4. **Abrangência dos nomes reais:** app inteiro — renomear/expandir o roster de vendedores no seed.

## Direção visual

**Split-screen com painel de marca** + toques industriais sutis. Apresentar em **dark mode**.

### Painel esquerdo (marca) — `hidden md:flex`, ~45% largura

- Fundo escuro (`bg-card` ou `bg-foreground` conforme contraste), `border-r border-border`.
- Logo GALLO (variant horizontal).
- Tagline: "Inteligência comercial acima do ERP".
- Marca d'água: ícone Iconify (`mdi:truck-cargo` ou `mdi:cog`) grande, `opacity-[0.04]`, atrás do conteúdo.
- Textura industrial: gradiente diagonal sutil `from-card to-background`. Sem fotos clichê.
- Rodapé do painel: selos das submarcas PARTS (verde) / SERVICE (vermelho) / INDUSTRIAL (amarelo).

### Coluna direita (login híbrido)

1. **Cabeçalho:** sobrescrita `text-primary uppercase text-xs tracking-[0.2em]` ("Plataforma de inteligência comercial") + título `text-3xl/4xl font-bold tracking-tight` ("Acesse a plataforma").
2. **Form realista (mockado):**
   - Campos: E-mail + Senha; botão "Entrar".
   - Comportamento: senha aceita qualquer valor (inclusive vazio na demo). Ao submeter, casa o e-mail digitado (case-insensitive, trim) com `email` de um perfil de `MOCK_USERS`. Se casar → `signIn(profile.id)` e redireciona para `next ?? profile.defaultRedirect`. Se não casar → erro inline "E-mail não reconhecido. Use um perfil de demonstração abaixo.".
   - Form: inputs controlados (`useState`) + `EMAIL_REGEX`, espelhando o padrão do login da loja (`src/features/storefront-account/pages/LoginPage.tsx`). Validação: e-mail com formato válido; senha sem regra (mock).
3. **Divisor:** "ou entre como perfil de demonstração".
4. **Cards-botão de perfil (acesso rápido):**
   - O card inteiro é o elemento clicável (`<button>` / `role="button"`), sem botão interno redundante.
   - Conteúdo: avatar (iniciais, `ring-2 ring-border`), nome, badge do papel, descrição em 1 linha.
   - Faixa de accent lateral (3px) na cor do papel.
   - Hover: `hover:border-primary/60 hover:bg-accent` + `transition-colors duration-200`; seta `lucide/iconify arrow-right` que desliza (`group-hover:translate-x-1`). Sem `scale`.
   - Dourado pontual: primária em **um** elemento por card (avatar do Owner OU a seta), nunca em todos.
   - Entrada: fade-in escalonado (delay incremental ~40ms), respeitar `prefers-reduced-motion`.
   - Agrupamento: bloco **Equipe GALLO** (Fernando, Marina, Lucas, Cauan, Ramon, Welligton) + **Cliente B2B** (Transportadora Aurora).
5. **Admin AILA discreto:** acesso ao perfil do Edmilson fora do grid principal — um link/chip discreto (`text-muted-foreground`, menor) no rodapé da coluna, ex.: "Acesso AILA · Suporte".
6. **Aviso de mock:** manter a linha "Esta é uma fase de mockup. Autenticação real na Fase 2 (Supabase Auth)." em `text-xs text-muted-foreground`.

### Responsividade / dark mode / acessibilidade

- Mobile (`< md`): painel de marca colapsa em cabeçalho compacto (logo + tagline curta); form e cards empilham em 1 coluna, full-width.
- Cards 1–2 colunas em telas largas (não 3 apertadas).
- Contraste WCAG ≥ 4.5:1 para texto; dourado sobre escuro só em texto se passar, senão dourado fica em ícones/bordas (≥3:1 não-texto).
- Card clicável: `aria-label="Entrar como {nome}, {papel}"`, ativação por Enter/Espaço, `focus-visible:ring-2 ring-ring`, alvo ≥44px.
- Papel nunca codificado só por cor — sempre acompanhado de badge/label.
- **Apenas tokens semânticos** (`bg-background`, `text-foreground`, `bg-primary`, `border-border`, `text-muted-foreground`…). Nunca hex fixo nem tokens primitivos `--gallo-*`.

## Roster de usuários

### Perfis de login — `MOCK_USERS` (8 perfis)

| #   | displayName                              | role (RBAC)     | displayRole (label) | email                            | group  | sellerId               | defaultRedirect  |
| --- | ---------------------------------------- | --------------- | ------------------- | -------------------------------- | ------ | ---------------------- | ---------------- |
| 1   | Fernando Mello Muniz Gallo               | Owner           | —                   | fernando@gallobasediesel.com.br  | team   | seller-joao-gallo      | /app/inicio      |
| 2   | Marina Cardoso _(sintético)_             | Gestor          | —                   | marina@gallobasediesel.com.br    | team   | seller-marina-cardoso  | /app/inicio      |
| 3   | Lucas Costa                              | Vendedor        | —                   | lucas@gallobasediesel.com.br     | team   | seller-carlos-santos   | /app/atendimento |
| 4   | Cauan Bulegon                            | Vendedor        | —                   | caua@gallobasediesel.com.br      | team   | seller-rafael-lima     | /app/atendimento |
| 5   | Ramon Schimidt                           | Vendedor        | —                   | ramon@gallobasediesel.com.br     | team   | seller-ramon-schimidt  | /app/atendimento |
| 6   | Welligton Nunes                          | VendedorExterno | —                   | welligton@gallobasediesel.com.br | team   | seller-welligton-nunes | /app/atendimento |
| 7   | Transportadora Aurora Ltda _(sintético)_ | Cliente         | —                   | aurora@cliente.com.br            | client | —                      | /loja            |
| 8   | Edmilson Souza                           | Owner           | "Admin · AILA"      | admin@ailainteligente.com        | admin  | —                      | /app/inicio      |

Notas:

- **`displayRole`**: campo novo, opcional, em `IMockUserProfile`. Apenas rótulo de exibição. Quando ausente, o card exibe `role`. Edmilson tem `role: "Owner"` (permissão) e `displayRole: "Admin · AILA"`.
- **`group`**: campo novo, `"team" | "client" | "admin"`, para agrupar os cards na UI.
- **`storeLabel`**: Edmilson → "AILA · Suporte"; Cliente → "Cliente B2B"; equipe → "GALLO Matriz".
- **`avatarInitials`**: derivadas do nome (FG, MC, LC, CB, RS, WN, TA, ES).
- `accessibleStoreIds`: equipe + Owner = `[MATRIZ_STORE_ID]`; Edmilson = `[MATRIZ_STORE_ID]` (Owner). Cliente sem store ativa.

### Roster de sellers no seed — `SEED_SELLERS` (4 → 6)

**Estratégia de IDs (refinada no planejamento):** os IDs dos sellers são identificadores internos referenciados de forma hardcoded em ~10 arquivos-fonte (geradores de ranking/goal/badge/conversas/segmentos, páginas de comissões/metas, `useCustomerAuth`). Renomeá-los exigiria editar todos esses arquivos com risco de regressão. Como a familiaridade da demo vem do **nome exibido**, e não do ID, mantemos os 4 IDs estáveis e apenas trocamos `fullName`/`email`, adicionando 2 IDs novos para os vendedores extras.

| id (estável)                    | fullName novo                | email                            | type     | papel conceitual |
| ------------------------------- | ---------------------------- | -------------------------------- | -------- | ---------------- |
| seller-joao-gallo               | Fernando Mello Muniz Gallo   | fernando@gallobasediesel.com.br  | internal | Owner            |
| seller-marina-cardoso           | Marina Cardoso _(sintético)_ | marina@gallobasediesel.com.br    | internal | Gestor           |
| seller-carlos-santos            | Lucas Costa                  | lucas@gallobasediesel.com.br     | internal | Vendedor         |
| seller-rafael-lima              | Cauan Bulegon                | caua@gallobasediesel.com.br      | internal | Vendedor         |
| seller-ramon-schimidt _(novo)_  | Ramon Schimidt               | ramon@gallobasediesel.com.br     | internal | Vendedor         |
| seller-welligton-nunes _(novo)_ | Welligton Nunes              | welligton@gallobasediesel.com.br | external | VendedorExterno  |

- `SEED_OWNER_ID = "seller-joao-gallo"` (inalterado — Fernando é o owner, mantém os filtros `!== "seller-joao-gallo"` corretos).
- `SEED_VENDEDOR_SELLER_IDS` (elegíveis a carteira) = `["seller-carlos-santos", "seller-rafael-lima", "seller-ramon-schimidt", "seller-welligton-nunes"]` (Lucas, Cauan, Ramon, Welligton). Removida a Marina (Gestor) da elegibilidade automática.
- `phone`/`availability`/`createdAt`/`divisions`: manter padrão atual (telefones fictícios sequenciais, `divisions: ["parts"]`).

## Impacto e integração

- **IDs de seller mantidos estáveis** — nenhuma das ~10 referências hardcoded precisa mudar; elas continuam apontando para os mesmos IDs, que agora exibem nomes reais. Único arquivo de dados alterado: `seedSellers.ts`.
- Geradores de mock (ranking, carteira, comissões, metas) iteram sobre o roster — passam a produzir dados para 6 sellers; sem mudança de lógica, só mais dados (melhor para a demo).
- `signIn` / `useAuth` / `AuthProvider`: sem mudança de assinatura. O form híbrido reusa `signIn(profileId)` após casar o e-mail.

## Escopo de arquivos

- `src/mocks/data/seedSellers.ts` — renomeia 4 + adiciona 2 sellers, atualiza `SEED_VENDEDOR_SELLER_IDS` (`SEED_OWNER_ID` inalterado). IDs estáveis — nenhuma ref hardcoded muda.
- `src/features/auth/mock-users.ts` — reescreve os 8 perfis; adiciona `displayRole?` e `group` a `IMockUserProfile`.
- `src/routes/auth.login.tsx` — split-screen + form híbrido (zod/react-hook-form) + cards-botão agrupados + acesso AILA discreto.
- `src/features/shell/layouts/AuthLayout.tsx` — vira wrapper full-height; painel de marca extraído para componente reutilizável (ex.: `src/features/auth/BrandPanel.tsx`).
- **Fora de escopo:** `loja.login`, `pwa.login`, `portal.login`.

## Critérios de aceite

1. `/auth/login` exibe split-screen com painel de marca à esquerda (em `md:+`) e login híbrido à direita.
2. Form aceita e-mail de qualquer perfil conhecido + senha qualquer → loga e redireciona corretamente; e-mail desconhecido → toast de erro.
3. Os 8 perfis aparecem: equipe agrupada, Cliente B2B, e Admin AILA discreto/apartado.
4. Cards são botões acessíveis (teclado, foco visível, `aria-label`, alvo ≥44px).
5. Rankings/carteira/comissões/dashboards do app exibem os nomes reais (Fernando, Lucas, Cauan, Ramon, Welligton) e o Gestor sintético.
6. Build passa (`bun run build` — type-check via `tsc --noEmit`) e `bun run lint` limpo.
7. Apenas tokens semânticos; nenhum hex/`--gallo-*` direto nos componentes novos.
