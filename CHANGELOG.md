# Changelog

All notable changes to **GALLO BASE DIESEL** are documented here.
Format follows [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/);
versioning follows [SemVer](https://semver.org/).

## [0.2.0] — Genesis · 2026-05-25

Esqueleto navegável da plataforma. PRD-003 implementado.

### Added
- **Roteamento end-to-end**: 3 árvores de rota (`/app/*` interno, `/loja/*`
  vitrine, `/auth/*` login) + rotas de erro (`/sem-permissao`, `/erro`).
  Todas as 30+ rotas funcionais com placeholders referenciando os PRDs futuros
- **Auth mockada** com 3 perfis (Owner "João Gallo", Vendedor "Carlos Santos",
  Cliente "Transportadora Aurora") em `/auth/login`, persistência em
  `localStorage` chave `gallo-mock-user`
- **AuthProvider + useAuth** hook com `signIn`, `signOut`, `hasRole`
- **Guards de role** via `beforeLoad` em rotas TanStack — `/app/*` exige
  Owner ou Vendedor; rotas de Gestão e Carteira exigem Owner
- **8 layouts reutilizáveis**: AppLayout, AuthLayout, EmptyLayout, LojaLayout,
  ConversationLayout (3 colunas), DetailLayout (2 colunas), DashboardLayout,
  SettingsLayout (sub-sidebar)
- **Sidebar** contextualizada por papel (Owner vê todos os agrupamentos;
  Vendedor vê subconjunto), expandida/colapsada com persistência em
  `localStorage` (`gallo-sidebar-collapsed`)
- **TopBar** com logo, seletor de loja (mock "GALLO Matriz"), busca global
  placeholder, notificações com badge + dropdown mockado, ThemeSwitcher,
  avatar com dropdown (Perfil, Configurações, Trocar perfil, Sair)
- **BottomNav** mobile (`<768px`) com 4 itens prioritários + Sheet "Mais"
- **LojaHeader** e **LojaFooter** para vitrine pública
- **PlaceholderPage / EmptyState** componentes reutilizáveis
- **RouteSkeleton** para `<Suspense>` fallback (lazy loading já ativo via
  `tanstackRouter({ autoCodeSplitting: true })`)
- Rota raiz `/` redireciona inteligentemente baseado em auth e papel
- Página `/app/configuracoes/aparencia` minimamente funcional (ThemeSwitcher
  integrado)

### Changed
- `__root.tsx` agora envolve a árvore em `<AuthProvider>`
- Home (`/`) deixou de ser página estática — agora é redirect via
  `beforeLoad`
- README implícito: estrutura `src/features/shell/` e `src/features/auth/`
  introduzidas

### Notes
- **Adaptação ao stack**: PRD-003 especifica React Router v6; mantivemos
  TanStack Router (já configurado e funcional). Conceitos equivalentes
  (rotas aninhadas, lazy loading, guards via `beforeLoad`, layout routes).
- Auth mockada é **UX, não segurança** — qualquer um pode editar
  localStorage. Proteção real virá na Fase 2 (Supabase Auth + RLS).
- Conteúdo funcional das 30+ telas internas será preenchido pelos PRDs
  específicos dos Blocos 1-6.

## [0.1.1] — Genesis · 2026-05-25

Modelo conceitual de domínio completo. PRD-002 implementado.

### Added

- Modelo conceitual GALLO consolidado em `src/shared/types/` (10 arquivos)
  cobrindo ~40 entidades: plataforma, pessoas, cliente, lead, conversa,
  catálogo, comercial e BI
- Tipos utilitários comuns: `ID`, `ISO8601`, `Money`, `Division`,
  `ThemeName`, `ThemeMode` em `common.ts`
- Barrel export em `src/shared/types/index.ts` — import único via
  `@/shared/types`
- `docs/glossario.md` — definições operacionais oficiais do domínio
  (termos técnicos do mercado de peças pesadas, comerciais, operacionais
  e arquiteturais)
- JSDoc com `@see` glossário nas interfaces principais
  (`ICustomer`, `IPart`, `IConversation`, `ICarteiraTransfer`,
  `IPositivation`, `IRecommendation` etc.)
- Discriminated union B2B/B2C em `ICustomer` (CNPJ vs CPF)
- Suporte modelado de 4 tipos de transferência de carteira
  (`CarteiraTransferType`)
- Capability matrix de WhatsApp (`IWhatsAppCapabilities`) preparando UI
  adaptativa por provider

### Changed

- `tsconfig.json` reforçado com `noImplicitAny`, `strictNullChecks` e
  `noUncheckedIndexedAccess`
- `src/config/themes.ts` agora re-exporta `ThemeName` e `ThemeMode` de
  `@/shared/types` (fonte única)
- `src/lib/contrast.ts` ajustado para o novo `noUncheckedIndexedAccess`
- `src/components/ui/input-otp.tsx` ajustado para acesso seguro a slots

### Notes

- `exactOptionalPropertyTypes` permanece **desativado** — incompatível
  com boilerplate atual do shadcn/ui em vários componentes
  (`context-menu`, `dropdown-menu`, `menubar`, `Icon`). Registrado como
  tech-debt; reavaliar em PRD futuro de hardening.
- Equipes (`ITeam`) modeladas mas **dormentes** no MVP.
- SERVICE e INDUSTRIAL modeladas via `Division` mas dormentes no MVP
  (todas as entidades comerciais nascem com `division: 'parts'`).

## [0.1.0] — Genesis · 2026-05-25

Fundação visual da plataforma. PRD-001 implementado.

### Added

- Identidade visual GALLO BASE DIESEL aplicada à UI
- Arquitetura de tokens em 3 camadas: primitivos → semânticos → tema
- Sistema de **4 temas × 2 modos** (8 combinações):
  Diesel (Black Gold), Parts (Forest), Service (Crimson), Industrial (Amber);
  light/dark/auto
- `ThemeProvider`, hook `useTheme()`, `ThemeSwitcher` com codinomes UI
- Persistência em `localStorage` (`gallo-theme`, `gallo-mode`) com fallback
  silencioso quando indisponível
- Script anti-FOUC inline no `<head>` aplicando tema/modo antes do primeiro paint
- Tipografia oficial: **Saira Condensed** (display), **Inter** (UI),
  **JetBrains Mono** (códigos OEM) via Google Fonts com `font-display: swap`
- Logo GALLO em variantes (`horizontal`, `vertical`, `mark`) — placeholders
  tipográficas que adaptam cor ao modo
- Favicon SVG com signo GALLO
- Wrapper `<Icon>` sobre Iconify (`@iconify/react`) com fallback gracioso
  e carregamento sob demanda
- Layout primitives: `Stack`, `Inline`, `Grid`, `Container`
- Galeria shadcn/ui customizada consumindo apenas tokens semânticos
- Rota `/design-system` (dev-only, redireciona em produção) com:
  tokens primitivos, tokens semânticos resolvidos, tipografia, espaçamento,
  raios, sombras, ícones recomendados, galeria de componentes,
  validador de contraste WCAG 2.1 em tempo real
- Respeito a `prefers-reduced-motion`

### Notes

- Logos atuais são **placeholders tipográficas**; substituir pelos SVGs
  oficiais em `public/` quando disponíveis.
- Cores funcionais (`success`/`warning`/`danger`/`info`) são propositalmente
  distintas das submarcas para evitar confusão semântica.
