---
description: Mecânica do sistema de temas (PRD-001) — 2 dimensões CSS, tokens em 3 camadas, anti-FOUC e persistência.
paths:
  - "src/styles.css"
  - "src/config/themes.ts"
  - "src/components/ThemeProvider.tsx"
  - "src/components/ThemeSwitcher.tsx"
  - "src/hooks/useTheme.ts"
  - "src/routes/design-system.tsx"
  - "index.html"
---

# Sistema de temas (PRD-001)

Modelagem em **duas dimensões CSS independentes** no `<html>`:

```html
<html data-theme="diesel|parts|service|industrial" data-mode="light|dark"></html>
```

Mais a classe `.dark` (variante Tailwind via `@custom-variant dark (&:is(.dark *))`).

- **Persistência:** `localStorage` chaves `gallo-theme` e `gallo-mode` — constantes em `src/config/themes.ts` (`LOCALSTORAGE_KEYS`). `mode` aceita `auto` (observa `prefers-color-scheme`).
- **Anti-FOUC:** script inline no `<head>` do `index.html` aplica os atributos antes do primeiro paint. Se mudar as chaves do localStorage ou os nomes de tema, **atualizar esse script também**.
- **Provider/hook:** `ThemeProvider` em `src/components/ThemeProvider.tsx`, hook em `src/hooks/useTheme.ts` (legado — ainda não migrado para `shared/hooks`). Acesso de leitura sempre via `useTheme()`.
- **Tokens em 3 camadas** (`src/styles.css`):
  1. **Primitivos** (`:root` — `--gallo-*`): paleta GALLO bruta. Não usar direto em componentes.
  2. **Semânticos** (`@theme inline`): `--background`, `--foreground`, `--primary`, etc. — mapeados para Tailwind/shadcn.
  3. **Tema** (`[data-theme="…"]` + `.dark|.light`): reescreve os semânticos.
- ⚠️ **Componentes consomem APENAS tokens semânticos** (`bg-background`, `text-foreground`, `border-border`…). Nunca referenciar `--gallo-*` ou hex direto. Severidades via utilitários Tailwind `text-/bg-/border-severity-{info|success|warning|critical}`.
- **Rota `/design-system`:** visualização de tokens, tipografia, componentes shadcn e validador de contraste WCAG. É **dev-only** (`beforeLoad` chama `redirect({ to: '/' })` quando `!import.meta.env.DEV`).
