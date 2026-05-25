
# PRD-001 — GALLO Design System (v0.1.0 Genesis)

Scaffold de um web app TanStack Start com identidade GALLO BASE DIESEL completa: tokens em 3 camadas, 4 temas × 2 modos, ~28 componentes shadcn, logo placeholder e página `/design-system`.

## Decisões assumidas (confirmadas)

- **Logo**: placeholders tipográficas geradas a partir de Saira Condensed 700, em todas as variantes (horizontal, vertical, mono branco, mono preto, signo "G").
- **Paleta oficial** (definida agora, fácil de trocar depois em `tokens.css`):
  - Preto técnico `#0E0E0E`, preto absoluto `#000000`, cinza estrutural `#1A1A1A`
  - Diesel (dourado óleo): light `#E8C66B`, medium `#C9A24A`, dark `#8C6E25`
  - PARTS (verde RS): `#1E7A3C` (medium), com light/dark derivados
  - SERVICE (vermelho RS): `#C8262C` (medium)
  - INDUSTRIAL (amarelo RS): `#C79C2C` (medium, do PRD)
  - Semânticas funcionais (success/warning/danger/info) em tons distintos das submarcas
- **Stack**: web_app artifact (TanStack Start + Vite + TS + Tailwind), shadcn já incluso no template.
- **Não vou** rodar bateria automatizada WCAG — o validador de contraste embutido em `/design-system` cumpre o RF-028.

## Fases

### Fase 1 — Scaffold + dependências
- Criar artifact `web_app:gallo-base-diesel`
- Adicionar `@iconify/react` (CVA/clsx/tailwind-merge já vêm com shadcn)
- Estrutura de pastas: `src/shared/{components,hooks,utils}`, `src/styles/`, `src/features/design-system/`, `src/config/`

### Fase 2 — Tokens e temas
- `src/styles/tokens.css` — camada primitiva (paleta GALLO completa + escala neutra 50-950 + semânticas funcionais)
- `src/styles/themes.css` — camada semântica para 8 combinações via `[data-mode][data-theme]`
- `tailwind.config.ts` mapeando `colors.*` para `var(--…)`
- `src/shared/hooks/useTheme.ts` (tipado, com `ThemeName | ThemeMode`)
- `src/shared/components/ThemeProvider.tsx` (aplica `data-theme`/`data-mode` no `<html>`, persiste em `localStorage` com try/catch)
- Script inline anti-FOUC no `index.html`
- `src/shared/components/ThemeSwitcher.tsx` com codinomes: Black Gold, Forest, Crimson, Amber + toggle light/dark/auto
- Respeitar `prefers-reduced-motion`

### Fase 3 — Tipografia, ícones e logo
- Google Fonts (Saira Condensed, Inter, JetBrains Mono) com preconnect + `display=swap` no `index.html`
- Tokens `--font-display/body/mono` + escala de tamanhos
- Wrapper `<Icon>` em cima de `@iconify/react` com fallback de placeholder
- Gerar SVGs placeholder em `public/logo/`: horizontal, vertical, mono-white, mono-black, mark (signo "G")
- Favicons (16, 32, 48, 96, 192, 512) — referenciados no `index.html`
- `<Logo>` que escolhe variante por prop + adapta cor ao modo

### Fase 4 — Componentes base
- Instalar/customizar os ~28 componentes shadcn listados na RF-027 (todos via tokens semânticos)
- Layout primitives `Stack`, `Inline`, `Grid`, `Container` em `src/shared/components/layout/`
- `cn()` em `src/shared/utils/cn.ts`
- Barrel exports

### Fase 5 — Página `/design-system` + WCAG
- Rota acessível só com `import.meta.env.DEV` (em prod retorna 404 / redirect `/`)
- Seções: tokens primitivos, tokens semânticos, tipografia, espaçamento, raios, sombras, ícones recomendados, galeria de componentes em todos os estados
- ThemeSwitcher embarcado na página
- Validador de contraste em tempo real (calcula razão WCAG dos pares texto/fundo, marca verde/vermelho)
- Ajustar tokens semânticos se algum par falhar em qualquer das 8 combinações

### Pós-implementação
- `CHANGELOG.md` Keep a Changelog com entrada `v0.1.0 — Genesis`
- Bump `package.json` para `0.1.0`

## Detalhes técnicos

```text
src/
├── styles/
│   ├── tokens.css        # camada 1: primitivos
│   └── themes.css        # camada 2+3: semânticos × 8 combinações
├── shared/
│   ├── components/
│   │   ├── ThemeProvider.tsx
│   │   ├── ThemeSwitcher.tsx
│   │   ├── Logo.tsx
│   │   ├── Icon.tsx
│   │   └── layout/{Stack,Inline,Grid,Container}.tsx
│   ├── hooks/useTheme.ts
│   └── utils/cn.ts
├── features/design-system/
│   ├── route.tsx
│   ├── sections/{Tokens,Typography,Spacing,Radii,Shadows,Icons,Components}.tsx
│   └── ContrastChecker.tsx
└── config/themes.ts      # constantes DEFAULT_THEME, LOCALSTORAGE_KEYS, THEME_CODENAMES
```

Constantes:
```ts
export const LOCALSTORAGE_KEYS = { theme: 'gallo-theme', mode: 'gallo-mode' } as const;
export const DEFAULT_THEME: ThemeName = 'diesel';
export type ThemeName = 'diesel' | 'parts' | 'service' | 'industrial';
export type ThemeMode = 'light' | 'dark' | 'auto';
```

Validador de contraste: implementação direta da fórmula WCAG (luminância relativa → razão), sem dependência externa.

## Fora de escopo (conforme PRD)

Componentes de domínio, telas funcionais, auth real, e-mails, charts, animações elaboradas, alto-contraste, temas customizados pelo usuário.
