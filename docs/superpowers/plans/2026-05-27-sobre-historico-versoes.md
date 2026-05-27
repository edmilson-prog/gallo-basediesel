# Página "Sobre" com histórico de versões — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar a rota `/app/configuracoes/sobre` que mostra a identidade da plataforma GALLO BASE DIESEL, a versão atual em destaque, e o histórico completo das 36 releases parseadas em runtime do `CHANGELOG.md`.

**Architecture:** Página composta dentro do `SettingsLayout` existente. O `CHANGELOG.md` é copiado para `public/` por um script `prebuild`/`predev`, servido como asset estático, fetchado e cacheado via TanStack Query (`staleTime: Infinity`), e parseado em runtime por um parser próprio sem dependências de markdown. Categorias coloridas (Added/Changed/Fixed/Notes/etc.) e filtros locais (search + tipo + período).

**Tech Stack:** React 19 · TanStack Router (file-based) · TanStack Query · Tailwind v4 + shadcn/ui · TypeScript estrito · Bun + Vite.

**Convenção de validação:** O projeto **não tem suite de testes** (declarado em CLAUDE.md: "type-check é coberto pelo `noEmit` do `tsc` via `bun run build`"). Cada task que altera código de produção valida via `bun run build` (typecheck completo) e/ou verificação manual em browser via `bun run dev`. NÃO escrever arquivos `*.test.ts` — não há runner. Para o parser (lógica pura), usar fixtures inline + verificação manual com `console.log` durante o desenvolvimento (sem manter o log no commit).

**Spec de origem:** `docs/superpowers/specs/2026-05-27-sobre-historico-versoes-design.md`

---

## File Structure

### Arquivos a CRIAR

```
scripts/
  copy-changelog.mjs                                     # Node script para copiar CHANGELOG.md

src/shared/types/
  about.ts                                               # IRelease, ReleaseKind, ReleaseCategory, IReleaseCategoryBlock

src/features/about/
  index.ts                                               # barrel (exporta AboutPage)
  pages/
    AboutPage.tsx                                        # composição da página
  components/
    PlatformIdentityCard.tsx
    CurrentVersionCard.tsx
    ReleaseHistorySection.tsx
    ReleaseToolbar.tsx
    ReleaseItem.tsx
    ReleaseBody.tsx
    ReleaseCategoryBlock.tsx
    AboutFooterCards.tsx
  hooks/
    useChangelog.ts
    useReleaseFilters.ts
  parser/
    classifyVersion.ts                                   # SemVer → 'major' | 'minor' | 'patch'
    parseChangelog.ts                                    # markdown → IRelease[]
    renderInlineMarkdown.ts                              # parser mínimo: `code`, **bold**, *italic*
  i18n/
    pt-BR.ts

src/routes/
  app.configuracoes.sobre.tsx                            # rota TanStack
```

### Arquivos a MODIFICAR

```
.gitignore                                               # adicionar public/CHANGELOG.md
package.json                                             # scripts predev/prebuild
src/features/shell/config/routes.ts                      # adicionar CONFIG_SOBRE
src/features/shell/layouts/SettingsLayout.tsx            # adicionar item "Sobre" em SETTINGS_GROUPS
```

### Arquivos GERADOS (gitignored)

```
public/CHANGELOG.md                                      # copia do CHANGELOG.md da raiz, gerada por script
```

---

## Task 1: Asset pipeline — script de cópia + scripts npm

**Files:**

- Create: `scripts/copy-changelog.mjs`
- Modify: `package.json` (scripts section)
- Modify: `.gitignore` (adicionar `public/CHANGELOG.md`)

- [ ] **Step 1: Criar o script Node de cópia**

Criar `scripts/copy-changelog.mjs`:

```javascript
// Copies the root CHANGELOG.md into public/ so it's served as a static asset.
// Invoked by `predev` and `prebuild` hooks in package.json.
// Cross-platform (Node fs APIs, no shell-specific commands).
import { copyFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const src = resolve(root, "CHANGELOG.md");
const dest = resolve(root, "public", "CHANGELOG.md");

if (!existsSync(src)) {
  console.error(`[copy-changelog] source not found: ${src}`);
  process.exit(1);
}

await mkdir(dirname(dest), { recursive: true });
await copyFile(src, dest);
console.log(`[copy-changelog] copied → ${dest}`);
```

- [ ] **Step 2: Adicionar hooks no package.json**

Editar `package.json` — na seção `scripts`, ADICIONAR (não remover os existentes):

```json
{
  "scripts": {
    "predev": "node scripts/copy-changelog.mjs",
    "prebuild": "node scripts/copy-changelog.mjs",
    "prebuild:dev": "node scripts/copy-changelog.mjs",
    "prepreview": "node scripts/copy-changelog.mjs",
    "dev": "vite dev",
    "build": "vite build",
    "build:dev": "vite build --mode development",
    "preview": "vite preview",
    "lint": "eslint .",
    "format": "prettier --write ."
  }
}
```

(Preserva os 5 scripts originais; adiciona 4 hooks `pre*` na frente.)

- [ ] **Step 3: Atualizar .gitignore**

Editar `.gitignore` — ADICIONAR após a linha `.vercel/` (ou em qualquer lugar do arquivo, idealmente agrupado com outros gerados):

```
# Generated asset — copied from CHANGELOG.md at dev/build time (see scripts/copy-changelog.mjs)
public/CHANGELOG.md
```

- [ ] **Step 4: Rodar o script manualmente para validar**

Run:

```bash
node scripts/copy-changelog.mjs
```

Expected output: `[copy-changelog] copied → D:\claude\gallo-basediesel\public\CHANGELOG.md`

Verificar que o arquivo existe:

```bash
ls public/CHANGELOG.md
```

Expected: arquivo listado, com tamanho > 80KB.

- [ ] **Step 5: Validar build**

Run:

```bash
bun run build
```

Expected: build conclui sem erro; o `prebuild` hook executa o script automaticamente antes do `vite build`.

- [ ] **Step 6: Commit**

```bash
git add scripts/copy-changelog.mjs package.json .gitignore
git commit -m "feat(about): add CHANGELOG.md asset pipeline for runtime parsing"
```

---

## Task 2: Tipos de domínio

**Files:**

- Create: `src/shared/types/about.ts`
- Modify: `src/shared/types/index.ts` (re-export)

- [ ] **Step 1: Criar os tipos**

Criar `src/shared/types/about.ts`:

```typescript
/**
 * Domain types for the /app/configuracoes/sobre page.
 *
 * IRelease is the parsed shape of one Keep-a-Changelog H2 section.
 * Categories preserve the original bullet text in markdown (inline `code`,
 * **bold** and *italic* are rendered by renderInlineMarkdown at display time).
 */

export type ReleaseKind = "major" | "minor" | "patch";

export type ReleaseCategory =
  | "added"
  | "changed"
  | "fixed"
  | "removed"
  | "deprecated"
  | "security"
  | "notes"
  | "migration";

export interface IReleaseCategoryBlock {
  category: ReleaseCategory;
  items: string[];
}

export interface IRelease {
  /** Semver string, no leading "v". Example: "0.36.0". */
  version: string;
  /** Codename if present in the heading. Null for releases without one. */
  codename: string | null;
  /** ISO date "YYYY-MM-DD" extracted from the heading. */
  date: string;
  /** Derived by classifyVersion comparing with the previous release. */
  kind: ReleaseKind;
  /** Text between the H2 heading and the first H3 section. May be empty. */
  summary: string;
  /** First "Bloco Xx" match in the summary, or null. */
  block: string | null;
  /** Sections found, in original document order. */
  categories: IReleaseCategoryBlock[];
  /** Sum of items across all categories. */
  totalItems: number;
  /** Raw markdown of the entire release block — fallback if rendering fails. */
  raw: string;
}
```

- [ ] **Step 2: Verificar se há barrel em src/shared/types/index.ts**

Run:

```bash
grep -c "export" src/shared/types/index.ts
```

If output > 0: o arquivo é um barrel; ADICIONAR a linha:

```typescript
export type { ReleaseKind, ReleaseCategory, IReleaseCategoryBlock, IRelease } from "./about";
```

If output = 0: ignorar este passo, importações serão diretas via `@/shared/types/about`.

- [ ] **Step 3: Validar typecheck**

Run:

```bash
bun run build
```

Expected: PASS sem novos erros.

- [ ] **Step 4: Commit**

```bash
git add src/shared/types/about.ts src/shared/types/index.ts
git commit -m "feat(about): add domain types for release history (IRelease, ReleaseCategory)"
```

---

## Task 3: Parser — classifyVersion

**Files:**

- Create: `src/features/about/parser/classifyVersion.ts`

- [ ] **Step 1: Implementar classifyVersion**

Criar `src/features/about/parser/classifyVersion.ts`:

```typescript
import type { ReleaseKind } from "@/shared/types/about";

/**
 * Derives the release kind by comparing this version to the previous one.
 *
 * Rules:
 * - If MAJOR changed → "major"
 * - Else if MINOR changed → "minor"
 * - Else → "patch"
 *
 * `previous` is null when classifying the very first release in the
 * changelog — in that case it is treated as "major".
 *
 * Both inputs are SemVer triplets like "0.36.0", with no leading "v".
 */
export function classifyVersion(current: string, previous: string | null): ReleaseKind {
  if (previous === null) return "major";
  const [cMaj, cMin] = current.split(".").map(Number);
  const [pMaj, pMin] = previous.split(".").map(Number);
  if (cMaj !== pMaj) return "major";
  if (cMin !== pMin) return "minor";
  return "patch";
}
```

- [ ] **Step 2: Validar typecheck**

Run:

```bash
bun run build
```

Expected: PASS.

- [ ] **Step 3: Sanity check manual (não commitar logs)**

Adicionar temporariamente no fim do arquivo:

```typescript
// TEMP — remove before commit
console.log(classifyVersion("0.36.0", "0.35.0")); // → "minor"
console.log(classifyVersion("0.36.1", "0.36.0")); // → "patch"
console.log(classifyVersion("1.0.0", "0.36.0")); // → "major"
console.log(classifyVersion("0.1.0", null)); // → "major"
```

Rodar `bun run dev`, abrir o console do navegador em qualquer rota, importar via `await import('/src/features/about/parser/classifyVersion.ts')`. Confirmar os 4 outputs. REMOVER o bloco antes de commitar.

- [ ] **Step 4: Commit**

```bash
git add src/features/about/parser/classifyVersion.ts
git commit -m "feat(about): add classifyVersion parser (SemVer → major/minor/patch)"
```

---

## Task 4: Parser — parseChangelog

**Files:**

- Create: `src/features/about/parser/parseChangelog.ts`

- [ ] **Step 1: Implementar o parser principal**

Criar `src/features/about/parser/parseChangelog.ts`:

```typescript
import type { IRelease, IReleaseCategoryBlock, ReleaseCategory } from "@/shared/types/about";
import { classifyVersion } from "./classifyVersion";

/**
 * Parses a Keep-a-Changelog 1.1.0 markdown document into IRelease[].
 *
 * Recognised heading shape (case-sensitive on the version brackets):
 *   ## [0.36.0] — Pulse · 2026-05-27
 *   ## [0.36.1] - Patch-codename · 2026-06-01
 *   ## [0.1.0] — Genesis · 2026-04-12
 *
 * The dash separator can be em-dash (—) or hyphen (-).
 * The center separator (between codename and date) can be · or • or - or |.
 * Codename is optional — heading may be "## [0.1.0] · 2026-04-12" without a name.
 *
 * Returns releases sorted descending by version (most recent first).
 */
export function parseChangelog(raw: string): IRelease[] {
  const lines = raw.split(/\r?\n/);

  // Identify H2 release headings — collect [lineIndex, version, codename, date]
  const headings: Array<{
    lineIdx: number;
    version: string;
    codename: string | null;
    date: string;
  }> = [];

  const headingRe =
    /^##\s+\[(\d+\.\d+\.\d+)\](?:\s*[—\-]\s*([^·•\-|][^·•|]*?))?\s*[·•\-|]\s*(\d{4}-\d{2}-\d{2})\s*$/;

  for (let i = 0; i < lines.length; i++) {
    const m = headingRe.exec(lines[i]);
    if (m) {
      headings.push({
        lineIdx: i,
        version: m[1],
        codename: m[2] ? m[2].trim() : null,
        date: m[3],
      });
    }
  }

  // Build releases by slicing between headings
  const releases: IRelease[] = headings.map((h, idx) => {
    const endLine = idx + 1 < headings.length ? headings[idx + 1].lineIdx : lines.length;
    const bodyLines = lines.slice(h.lineIdx + 1, endLine);
    const rawBlock = bodyLines.join("\n").trim();

    const { summary, categories } = parseReleaseBody(bodyLines);
    const block = extractBlock(summary);
    const totalItems = categories.reduce((acc, c) => acc + c.items.length, 0);

    // kind is filled in a second pass once we know the chronological order
    return {
      version: h.version,
      codename: h.codename,
      date: h.date,
      kind: "patch" as const, // placeholder, overwritten below
      summary,
      block,
      categories,
      totalItems,
      raw: rawBlock,
    };
  });

  // Headings appear top-down in the file → most recent first (Keep-a-Changelog convention).
  // For classifyVersion we compare with the *previous* (older) release, which is
  // the NEXT element in the array (one step down chronologically). The last entry
  // has no previous → null.
  for (let i = 0; i < releases.length; i++) {
    const previousVersion = i + 1 < releases.length ? releases[i + 1].version : null;
    releases[i].kind = classifyVersion(releases[i].version, previousVersion);
  }

  return releases;
}

// ---------------------------------------------------------------------------

function parseReleaseBody(bodyLines: string[]): {
  summary: string;
  categories: IReleaseCategoryBlock[];
} {
  const sectionRe = /^###\s+(.+?)\s*$/;
  const sectionStarts: number[] = [];
  for (let i = 0; i < bodyLines.length; i++) {
    if (sectionRe.test(bodyLines[i])) sectionStarts.push(i);
  }

  const summaryEnd = sectionStarts[0] ?? bodyLines.length;
  const summary = bodyLines
    .slice(0, summaryEnd)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const categories: IReleaseCategoryBlock[] = [];
  for (let s = 0; s < sectionStarts.length; s++) {
    const start = sectionStarts[s];
    const end = s + 1 < sectionStarts.length ? sectionStarts[s + 1] : bodyLines.length;
    const headerMatch = sectionRe.exec(bodyLines[start]);
    if (!headerMatch) continue;

    const category = mapCategoryLabel(headerMatch[1]);
    if (category === null) continue; // unknown section — skipped silently

    const items = extractBullets(bodyLines.slice(start + 1, end));
    if (items.length > 0) {
      categories.push({ category, items });
    }
  }

  return { summary, categories };
}

function mapCategoryLabel(label: string): ReleaseCategory | null {
  const key = label.toLowerCase().trim();
  switch (key) {
    case "added":
      return "added";
    case "changed":
      return "changed";
    case "fixed":
      return "fixed";
    case "removed":
      return "removed";
    case "deprecated":
      return "deprecated";
    case "security":
      return "security";
    case "notes":
    case "notas":
      return "notes";
    case "migration notes":
    case "notas de migração":
    case "notas de migracao":
      return "migration";
    default:
      return null;
  }
}

/**
 * Extracts top-level bullets, concatenating continuation lines (indented
 * sub-bullets, wrapped text) into the same item separated by "\n".
 *
 * A "top-level bullet" starts at column 0 with `- ` or `* `.
 * Anything else following until the next top-level bullet (or blank line)
 * is appended to the current item.
 */
function extractBullets(blockLines: string[]): string[] {
  const out: string[] = [];
  let current: string[] = [];

  const isTopBullet = (line: string) => /^[-*]\s+/.test(line);
  const isContinuation = (line: string) =>
    /^\s+\S/.test(line) || (line.trim().length > 0 && !line.startsWith("#"));

  const flush = () => {
    if (current.length === 0) return;
    const joined = current.join("\n").replace(/\n+$/, "").trim();
    if (joined.length > 0) out.push(joined);
    current = [];
  };

  for (const line of blockLines) {
    if (isTopBullet(line)) {
      flush();
      current.push(line.replace(/^[-*]\s+/, ""));
    } else if (line.trim().length === 0) {
      flush();
    } else if (isContinuation(line) && current.length > 0) {
      current.push(line);
    }
  }
  flush();
  return out;
}

function extractBlock(summary: string): string | null {
  const m = /Bloco\s+(\d+\w?)/i.exec(summary);
  return m ? `Bloco ${m[1]}` : null;
}
```

- [ ] **Step 2: Validar typecheck**

Run:

```bash
bun run build
```

Expected: PASS.

- [ ] **Step 3: Sanity check manual contra o CHANGELOG real**

Adicionar temporariamente em `src/main.tsx` ANTES do `createRoot`:

```typescript
// TEMP — remove before commit
import { parseChangelog } from "@/features/about/parser/parseChangelog";
fetch("/CHANGELOG.md")
  .then((r) => r.text())
  .then((t) => {
    const releases = parseChangelog(t);
    console.log("total releases:", releases.length);
    console.log("first:", releases[0]);
    console.log("last:", releases[releases.length - 1]);
    console.log("kinds:", releases.map((r) => `${r.version}=${r.kind}`).join(", "));
  });
```

Rodar `bun run dev`, abrir http://localhost:5173, abrir console.

Expected:

- `total releases: 36` (ou número atual conferindo com `grep -c "^## \[" CHANGELOG.md`)
- `first.version === "0.36.0"`, `first.codename === "Pulse"`, `first.date === "2026-05-27"`, `first.kind === "minor"`, `first.categories.length >= 2`, `first.totalItems > 0`, `first.block === "Bloco 4b"`
- `last.version === "0.1.0"` (a release mais antiga), `last.kind === "major"`
- Kinds variando entre "minor" e "patch" e o "major" só no Genesis

REMOVER o bloco de `src/main.tsx` antes de commitar.

- [ ] **Step 4: Commit**

```bash
git add src/features/about/parser/parseChangelog.ts
git commit -m "feat(about): add changelog parser (markdown → IRelease[])"
```

---

## Task 5: Parser — renderInlineMarkdown

**Files:**

- Create: `src/features/about/parser/renderInlineMarkdown.ts`

- [ ] **Step 1: Implementar render mínimo de markdown inline**

Criar `src/features/about/parser/renderInlineMarkdown.ts`:

```typescript
import type { ReactNode } from "react";
import { Fragment } from "react";

/**
 * Renders a minimal subset of inline markdown:
 *   - `code spans`        → <code>...</code>
 *   - **bold**            → <strong>...</strong>
 *   - *italic* / _italic_ → <em>...</em>
 *
 * Markdown links, images, headings, lists, html etc. are NOT supported.
 * If those appear in the source they render as literal text.
 *
 * Order matters: code first (so backticks aren't re-parsed as bold/italic).
 */
export function renderInlineMarkdown(input: string): ReactNode {
  // Token = code | bold | italic | text
  type Token = { type: "code" | "bold" | "italic" | "text"; value: string };
  const tokens: Token[] = [];

  // 1) extract code spans
  const codePieces = input.split(/(`[^`\n]+`)/g);
  for (const piece of codePieces) {
    if (/^`[^`\n]+`$/.test(piece)) {
      tokens.push({ type: "code", value: piece.slice(1, -1) });
    } else {
      // 2) inside the non-code parts, extract bold then italic
      const boldPieces = piece.split(/(\*\*[^*]+\*\*)/g);
      for (const bp of boldPieces) {
        if (/^\*\*[^*]+\*\*$/.test(bp)) {
          tokens.push({ type: "bold", value: bp.slice(2, -2) });
        } else {
          const italicPieces = bp.split(/(\*[^*\n]+\*|_[^_\n]+_)/g);
          for (const ip of italicPieces) {
            if (/^\*[^*\n]+\*$/.test(ip) || /^_[^_\n]+_$/.test(ip)) {
              tokens.push({ type: "italic", value: ip.slice(1, -1) });
            } else if (ip.length > 0) {
              tokens.push({ type: "text", value: ip });
            }
          }
        }
      }
    }
  }

  return tokens.map((t, i) => {
    const key = `${i}-${t.type}`;
    switch (t.type) {
      case "code":
        return (
          <code
            key={key}
            className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground"
          >
            {t.value}
          </code>
        );
      case "bold":
        return (
          <strong key={key} className="font-semibold text-foreground">
            {t.value}
          </strong>
        );
      case "italic":
        return (
          <em key={key} className="italic">
            {t.value}
          </em>
        );
      default:
        return <Fragment key={key}>{t.value}</Fragment>;
    }
  });
}
```

Renomear a extensão do arquivo para `.tsx` já que retorna JSX:

```bash
mv src/features/about/parser/renderInlineMarkdown.ts src/features/about/parser/renderInlineMarkdown.tsx
```

(Ou criar diretamente como `.tsx`. Atualizar imports posteriores para apontar para `.tsx` — TypeScript resolve sem extensão.)

- [ ] **Step 2: Validar typecheck**

Run:

```bash
bun run build
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/features/about/parser/renderInlineMarkdown.tsx
git commit -m "feat(about): add minimal inline markdown renderer (code/bold/italic)"
```

---

## Task 6: i18n pt-BR

**Files:**

- Create: `src/features/about/i18n/pt-BR.ts`

- [ ] **Step 1: Criar dicionário de rótulos**

Criar `src/features/about/i18n/pt-BR.ts`:

```typescript
import type { ReleaseCategory, ReleaseKind } from "@/shared/types/about";

export const ABOUT_I18N = {
  page: {
    title: "Sobre a plataforma",
    subtitle: "Identidade, mantenedor e histórico de versões.",
  },

  identity: {
    productName: "GALLO BASE DIESEL",
    tagline:
      "Plataforma de inteligência comercial para distribuidora de peças pesadas — posicionada acima do ERP DINTEC como cérebro comercial e relacional.",
    maintainerPrefix: "Mantida por ",
    maintainerName: "AILA Sistemas Inteligentes",
    maintainerEmail: "edmilson@ailainteligente.com",
    submarks: {
      parts: "PARTS",
      service: "SERVICE",
      industrial: "INDUSTRIAL",
    },
  },

  currentVersion: {
    metaDate: "Data",
    metaKind: "Tipo",
    metaBlock: "Bloco",
    metaDeliveries: "Entregas",
    whatsNew: "O que há de novo",
    codenamePrefix: "Codinome",
    deliveriesSuffix: "alterações",
  },

  history: {
    title: "Histórico de versões",
    countSuffix: "releases",
    searchPlaceholder: "Buscar por versão, codinome, recurso…",
    filterKindAll: "Todos os tipos",
    filterPeriodAll: "Todos os períodos",
    filterPeriodThisMonth: "Este mês",
    filterPeriodLast3Months: "Últimos 3 meses",
    filterPeriodThisYear: "Este ano",
    itemsSuffix: "itens",
    emptyTitle: "Nenhuma release encontrada",
    emptyDescription: "Ajuste os filtros ou limpe a busca para ver mais.",
    clearFilters: "Limpar filtros",
    rawFallbackNote: "Conteúdo cru exibido por limitação de formatação.",
  },

  loading: "Carregando histórico…",
  error: {
    title: "Não foi possível carregar o histórico",
    description: "O arquivo CHANGELOG.md não pôde ser baixado. Tente novamente em instantes.",
    retry: "Tentar novamente",
  },

  footer: {
    stack: {
      title: "Stack técnica",
      description: "React 19 · TanStack Router · Tailwind v4 · shadcn/ui · TanStack Query · Vercel",
    },
    support: {
      title: "Suporte",
      description: "Resposta em 1 dia útil",
    },
    docs: {
      title: "Documentação",
      descriptionTemplate: "50 PRDs catalogados · {{count}} releases entregues",
    },
  },
} as const;

export const RELEASE_KIND_LABEL: Record<ReleaseKind, string> = {
  major: "Major",
  minor: "Minor",
  patch: "Patch",
};

export const RELEASE_CATEGORY_LABEL: Record<ReleaseCategory, string> = {
  added: "Adicionado",
  changed: "Modificado",
  fixed: "Corrigido",
  removed: "Removido",
  deprecated: "Descontinuado",
  security: "Segurança",
  notes: "Notas",
  migration: "Migração",
};
```

- [ ] **Step 2: Validar typecheck**

Run:

```bash
bun run build
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/features/about/i18n/pt-BR.ts
git commit -m "feat(about): add pt-BR i18n dictionary"
```

---

## Task 7: Hook useChangelog (TanStack Query)

**Files:**

- Create: `src/features/about/hooks/useChangelog.ts`

- [ ] **Step 1: Implementar o hook**

Criar `src/features/about/hooks/useChangelog.ts`:

```typescript
import { useQuery } from "@tanstack/react-query";
import type { IRelease } from "@/shared/types/about";
import { parseChangelog } from "../parser/parseChangelog";

const CHANGELOG_URL = "/CHANGELOG.md";

/**
 * Fetches /CHANGELOG.md (copied into public/ by scripts/copy-changelog.mjs)
 * and parses it into IRelease[].
 *
 * Cached forever within the session (the file does not change at runtime).
 * On error the query keeps retrying twice with exponential backoff.
 */
export function useChangelog() {
  return useQuery<IRelease[], Error>({
    queryKey: ["changelog"],
    queryFn: async () => {
      const res = await fetch(CHANGELOG_URL, { cache: "no-cache" });
      if (!res.ok) {
        throw new Error(`CHANGELOG fetch failed: ${res.status} ${res.statusText}`);
      }
      const text = await res.text();
      return parseChangelog(text);
    },
    staleTime: Infinity,
    gcTime: Infinity,
    retry: 2,
  });
}
```

- [ ] **Step 2: Validar typecheck**

Run:

```bash
bun run build
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/features/about/hooks/useChangelog.ts
git commit -m "feat(about): add useChangelog hook (fetch + cache + parse)"
```

---

## Task 8: Hook useReleaseFilters + função applyFilters

**Files:**

- Create: `src/features/about/hooks/useReleaseFilters.ts`

- [ ] **Step 1: Implementar o hook e a função pura de filtro**

Criar `src/features/about/hooks/useReleaseFilters.ts`:

```typescript
import { useCallback, useMemo, useState } from "react";
import type { IRelease, ReleaseKind } from "@/shared/types/about";

export type ReleasePeriod = "all" | "thisMonth" | "last3Months" | "thisYear";
export type ReleaseKindFilter = "all" | ReleaseKind;

export interface IReleaseFilters {
  search: string;
  kind: ReleaseKindFilter;
  period: ReleasePeriod;
}

const INITIAL: IReleaseFilters = { search: "", kind: "all", period: "all" };

export function useReleaseFilters() {
  const [filters, setFilters] = useState<IReleaseFilters>(INITIAL);

  const setSearch = useCallback((search: string) => setFilters((f) => ({ ...f, search })), []);
  const setKind = useCallback((kind: ReleaseKindFilter) => setFilters((f) => ({ ...f, kind })), []);
  const setPeriod = useCallback(
    (period: ReleasePeriod) => setFilters((f) => ({ ...f, period })),
    [],
  );
  const reset = useCallback(() => setFilters(INITIAL), []);

  const isFiltered = useMemo(
    () => filters.search.trim().length > 0 || filters.kind !== "all" || filters.period !== "all",
    [filters],
  );

  return { filters, setSearch, setKind, setPeriod, reset, isFiltered };
}

/**
 * Pure filter applied client-side over the in-memory IRelease[].
 *
 * Search is case- and accent-insensitive, matches across version, codename,
 * summary and every category item. When the match is inside category items,
 * the caller should ensure the release is auto-expanded (handled by
 * ReleaseHistorySection).
 */
export function applyFilters(releases: IRelease[], filters: IReleaseFilters): IRelease[] {
  const normalized = normalize(filters.search);
  const now = new Date();

  return releases.filter((r) => {
    if (filters.kind !== "all" && r.kind !== filters.kind) return false;
    if (!matchesPeriod(r.date, filters.period, now)) return false;
    if (normalized.length === 0) return true;

    if (normalize(r.version).includes(normalized)) return true;
    if (r.codename && normalize(r.codename).includes(normalized)) return true;
    if (normalize(r.summary).includes(normalized)) return true;
    for (const c of r.categories) {
      for (const item of c.items) {
        if (normalize(item).includes(normalized)) return true;
      }
    }
    return false;
  });
}

/**
 * Returns true when `releaseDateIso` should be visible under `period`.
 * `now` is injected for testability.
 */
function matchesPeriod(releaseDateIso: string, period: ReleasePeriod, now: Date): boolean {
  if (period === "all") return true;
  const [yStr, mStr, dStr] = releaseDateIso.split("-");
  const rDate = new Date(Number(yStr), Number(mStr) - 1, Number(dStr));
  if (Number.isNaN(rDate.getTime())) return true;

  switch (period) {
    case "thisMonth":
      return rDate.getFullYear() === now.getFullYear() && rDate.getMonth() === now.getMonth();
    case "last3Months": {
      const cutoff = new Date(now);
      cutoff.setMonth(cutoff.getMonth() - 3);
      return rDate >= cutoff;
    }
    case "thisYear":
      return rDate.getFullYear() === now.getFullYear();
  }
}

function normalize(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
}
```

- [ ] **Step 2: Validar typecheck**

Run:

```bash
bun run build
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/features/about/hooks/useReleaseFilters.ts
git commit -m "feat(about): add release filters hook + pure applyFilters function"
```

---

## Task 9: Componente ReleaseCategoryBlock

**Files:**

- Create: `src/features/about/components/ReleaseCategoryBlock.tsx`

- [ ] **Step 1: Implementar o bloco colorido por categoria**

Criar `src/features/about/components/ReleaseCategoryBlock.tsx`:

```tsx
import type { IReleaseCategoryBlock, ReleaseCategory } from "@/shared/types/about";
import { cn } from "@/lib/utils";
import { renderInlineMarkdown } from "../parser/renderInlineMarkdown";
import { RELEASE_CATEGORY_LABEL } from "../i18n/pt-BR";

interface IProps {
  block: IReleaseCategoryBlock;
}

/**
 * Colored side-bar block listing the bullets of one Keep-a-Changelog section.
 * Color is driven by category — see CATEGORY_COLOR map below.
 */
export function ReleaseCategoryBlock({ block }: IProps) {
  const color = CATEGORY_COLOR[block.category];
  const label = RELEASE_CATEGORY_LABEL[block.category];

  return (
    <div className={cn("mb-3 rounded-r-md border-l-[3px] pl-3 last:mb-0", color.border, color.bg)}>
      <div
        className={cn(
          "flex items-center gap-2 py-1.5 text-xs font-semibold uppercase tracking-wider",
          color.text,
        )}
      >
        <span>{label}</span>
        <span className="rounded-full bg-foreground/10 px-2 py-0.5 text-[10px] font-medium normal-case tracking-normal text-muted-foreground">
          {block.items.length}
        </span>
      </div>
      <ul className="mb-2 ml-4 mt-0.5 list-disc space-y-1 text-sm text-muted-foreground">
        {block.items.map((item, idx) => (
          <li key={idx} className="leading-relaxed">
            {renderInlineMarkdown(item)}
          </li>
        ))}
      </ul>
    </div>
  );
}

const CATEGORY_COLOR: Record<ReleaseCategory, { border: string; bg: string; text: string }> = {
  added: {
    border: "border-l-success",
    bg: "bg-gradient-to-r from-success/10 to-transparent",
    text: "text-success",
  },
  changed: {
    border: "border-l-warning",
    bg: "bg-gradient-to-r from-warning/10 to-transparent",
    text: "text-warning",
  },
  fixed: {
    border: "border-l-info",
    bg: "bg-gradient-to-r from-info/10 to-transparent",
    text: "text-info",
  },
  removed: {
    border: "border-l-destructive",
    bg: "bg-gradient-to-r from-destructive/10 to-transparent",
    text: "text-destructive",
  },
  deprecated: {
    border: "border-l-destructive",
    bg: "bg-gradient-to-r from-destructive/10 to-transparent",
    text: "text-destructive",
  },
  security: {
    border: "border-l-destructive",
    bg: "bg-gradient-to-r from-destructive/10 to-transparent",
    text: "text-destructive",
  },
  notes: {
    border: "border-l-primary",
    bg: "bg-gradient-to-r from-primary/10 to-transparent",
    text: "text-primary",
  },
  migration: {
    border: "border-l-primary",
    bg: "bg-gradient-to-r from-primary/10 to-transparent",
    text: "text-primary",
  },
};
```

- [ ] **Step 2: Verificar tokens semânticos**

Run:

```bash
grep -E "(--success|--warning|--info|--destructive|--primary)" src/styles.css
```

Expected: cada um aparece pelo menos uma vez (são tokens de design system já existentes — o projeto usa).

Se algum token não existir: ajustar para um equivalente que exista (ex.: `--success` → `--accent` se necessário). Anotar no commit message qual substituição foi feita.

- [ ] **Step 3: Validar typecheck**

Run:

```bash
bun run build
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/features/about/components/ReleaseCategoryBlock.tsx
git commit -m "feat(about): add ReleaseCategoryBlock component (colored per category)"
```

---

## Task 10: Componente ReleaseBody

**Files:**

- Create: `src/features/about/components/ReleaseBody.tsx`

- [ ] **Step 1: Implementar o corpo expandido da release**

Criar `src/features/about/components/ReleaseBody.tsx`:

```tsx
import type { IRelease, ReleaseCategory } from "@/shared/types/about";
import { ReleaseCategoryBlock } from "./ReleaseCategoryBlock";
import { renderInlineMarkdown } from "../parser/renderInlineMarkdown";
import { ABOUT_I18N } from "../i18n/pt-BR";

interface IProps {
  release: IRelease;
}

/**
 * Fixed render order for category blocks (matches Keep-a-Changelog order
 * of severity / interest). Categories absent from the release are skipped.
 */
const ORDER: ReleaseCategory[] = [
  "added",
  "changed",
  "fixed",
  "removed",
  "deprecated",
  "security",
  "migration",
  "notes",
];

export function ReleaseBody({ release }: IProps) {
  const ordered = ORDER.map((cat) => release.categories.find((c) => c.category === cat)).filter(
    (c): c is NonNullable<typeof c> => c !== undefined,
  );

  // Fallback when parser found no recognised sections — render raw markdown
  // so the user still sees something.
  if (ordered.length === 0 && release.raw.length > 0) {
    return (
      <div className="space-y-3">
        {release.summary && (
          <p className="leading-relaxed text-muted-foreground">
            {renderInlineMarkdown(release.summary)}
          </p>
        )}
        <p className="text-xs italic text-muted-foreground">{ABOUT_I18N.history.rawFallbackNote}</p>
        <pre className="max-h-96 overflow-auto rounded-md border border-border bg-muted/30 p-3 text-xs leading-relaxed text-muted-foreground">
          {release.raw}
        </pre>
      </div>
    );
  }

  return (
    <div>
      {release.summary && (
        <p className="mb-4 leading-relaxed text-muted-foreground">
          {renderInlineMarkdown(release.summary)}
        </p>
      )}
      {ordered.map((block) => (
        <ReleaseCategoryBlock key={block.category} block={block} />
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Validar typecheck**

Run:

```bash
bun run build
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/features/about/components/ReleaseBody.tsx
git commit -m "feat(about): add ReleaseBody component (summary + ordered category blocks)"
```

---

## Task 11: Componente ReleaseItem (linha colapsável)

**Files:**

- Create: `src/features/about/components/ReleaseItem.tsx`

- [ ] **Step 1: Implementar a linha de release**

Criar `src/features/about/components/ReleaseItem.tsx`:

```tsx
import type { IRelease, ReleaseKind } from "@/shared/types/about";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { ReleaseBody } from "./ReleaseBody";
import { ABOUT_I18N, RELEASE_KIND_LABEL } from "../i18n/pt-BR";

interface IProps {
  release: IRelease;
  open: boolean;
  onToggle: (version: string) => void;
}

export function ReleaseItem({ release, open, onToggle }: IProps) {
  const dateLabel = formatDateBr(release.date);
  const kindBadge = KIND_BADGE[release.kind];

  return (
    <div
      id={`release-${release.version}`}
      className="mb-2 overflow-hidden rounded-lg border border-border bg-card"
    >
      <button
        type="button"
        onClick={() => onToggle(release.version)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/40"
      >
        <span className="min-w-[64px] font-mono text-sm font-semibold text-foreground">
          v{release.version}
        </span>
        <span
          className={cn(
            "rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
            kindBadge,
          )}
        >
          {RELEASE_KIND_LABEL[release.kind]}
        </span>
        <span className="flex-1 truncate text-sm text-muted-foreground">
          {release.codename ? (
            <>
              {ABOUT_I18N.currentVersion.codenamePrefix}{" "}
              <strong className="font-semibold text-foreground">{release.codename}</strong>
            </>
          ) : (
            <span className="text-muted-foreground/60">—</span>
          )}
        </span>
        <span className="hidden text-xs text-muted-foreground sm:inline">{dateLabel}</span>
        <span className="min-w-[60px] text-right text-xs text-muted-foreground">
          {release.totalItems} {ABOUT_I18N.history.itemsSuffix}
        </span>
        <Icon
          icon="mdi:chevron-down"
          size={18}
          className={cn("text-muted-foreground transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <div className="border-t border-border bg-muted/20 px-5 py-4">
          <ReleaseBody release={release} />
        </div>
      )}
    </div>
  );
}

const KIND_BADGE: Record<ReleaseKind, string> = {
  major: "bg-primary/10 text-primary",
  minor: "bg-info/10 text-info",
  patch: "bg-success/10 text-success",
};

function formatDateBr(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
```

- [ ] **Step 2: Validar typecheck**

Run:

```bash
bun run build
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/features/about/components/ReleaseItem.tsx
git commit -m "feat(about): add ReleaseItem (collapsible release row with kind badge)"
```

---

## Task 12: Componente ReleaseToolbar

**Files:**

- Create: `src/features/about/components/ReleaseToolbar.tsx`

- [ ] **Step 1: Implementar a toolbar de filtros**

Criar `src/features/about/components/ReleaseToolbar.tsx`:

```tsx
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Icon } from "@/components/Icon";
import type { IReleaseFilters, ReleaseKindFilter, ReleasePeriod } from "../hooks/useReleaseFilters";
import { ABOUT_I18N, RELEASE_KIND_LABEL } from "../i18n/pt-BR";

interface IProps {
  filters: IReleaseFilters;
  totalCount: number;
  filteredCount: number;
  onSearchChange: (value: string) => void;
  onKindChange: (value: ReleaseKindFilter) => void;
  onPeriodChange: (value: ReleasePeriod) => void;
}

export function ReleaseToolbar({
  filters,
  totalCount,
  filteredCount,
  onSearchChange,
  onKindChange,
  onPeriodChange,
}: IProps) {
  const showFiltered = filteredCount !== totalCount;

  return (
    <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
      <div className="relative flex-1">
        <Icon
          icon="mdi:magnify"
          size={16}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          type="search"
          value={filters.search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={ABOUT_I18N.history.searchPlaceholder}
          className="pl-9"
        />
      </div>

      <Select value={filters.kind} onValueChange={(v) => onKindChange(v as ReleaseKindFilter)}>
        <SelectTrigger className="w-full sm:w-[160px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{ABOUT_I18N.history.filterKindAll}</SelectItem>
          <SelectItem value="major">{RELEASE_KIND_LABEL.major}</SelectItem>
          <SelectItem value="minor">{RELEASE_KIND_LABEL.minor}</SelectItem>
          <SelectItem value="patch">{RELEASE_KIND_LABEL.patch}</SelectItem>
        </SelectContent>
      </Select>

      <Select value={filters.period} onValueChange={(v) => onPeriodChange(v as ReleasePeriod)}>
        <SelectTrigger className="w-full sm:w-[180px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{ABOUT_I18N.history.filterPeriodAll}</SelectItem>
          <SelectItem value="thisMonth">{ABOUT_I18N.history.filterPeriodThisMonth}</SelectItem>
          <SelectItem value="last3Months">{ABOUT_I18N.history.filterPeriodLast3Months}</SelectItem>
          <SelectItem value="thisYear">{ABOUT_I18N.history.filterPeriodThisYear}</SelectItem>
        </SelectContent>
      </Select>

      <div className="hidden text-xs text-muted-foreground sm:block">
        {showFiltered ? (
          <span>
            <strong className="font-semibold text-foreground">{filteredCount}</strong> de{" "}
            {totalCount} {ABOUT_I18N.history.countSuffix}
          </span>
        ) : (
          <span>
            <strong className="font-semibold text-foreground">{totalCount}</strong>{" "}
            {ABOUT_I18N.history.countSuffix}
          </span>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verificar imports de shadcn**

Run:

```bash
ls src/components/ui/input.tsx src/components/ui/select.tsx
```

Expected: ambos arquivos existem. Se algum não existir: parar e adicionar via shadcn CLI antes de continuar.

- [ ] **Step 3: Validar typecheck**

Run:

```bash
bun run build
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/features/about/components/ReleaseToolbar.tsx
git commit -m "feat(about): add ReleaseToolbar (search + kind + period filters)"
```

---

## Task 13: Componente ReleaseHistorySection

**Files:**

- Create: `src/features/about/components/ReleaseHistorySection.tsx`

- [ ] **Step 1: Implementar a seção de histórico orquestradora**

Criar `src/features/about/components/ReleaseHistorySection.tsx`:

```tsx
import { useEffect, useMemo, useState } from "react";
import type { IRelease } from "@/shared/types/about";
import { Button } from "@/components/ui/button";
import { ReleaseItem } from "./ReleaseItem";
import { ReleaseToolbar } from "./ReleaseToolbar";
import { applyFilters, useReleaseFilters } from "../hooks/useReleaseFilters";
import { ABOUT_I18N } from "../i18n/pt-BR";

interface IProps {
  releases: IRelease[];
}

/**
 * Owns the open/closed state of release rows and the active filters.
 *
 * Initially the most recent release is expanded. When the user changes the
 * search box, releases that match the search inside their bullet items are
 * auto-expanded so the matched content is visible.
 */
export function ReleaseHistorySection({ releases }: IProps) {
  const { filters, setSearch, setKind, setPeriod, reset, isFiltered } = useReleaseFilters();

  const filtered = useMemo(() => applyFilters(releases, filters), [releases, filters]);

  const [openVersions, setOpenVersions] = useState<Set<string>>(() => {
    const first = releases[0]?.version;
    return new Set(first ? [first] : []);
  });

  // When search yields hits inside category items, auto-expand those releases.
  useEffect(() => {
    if (filters.search.trim().length === 0) return;
    const toOpen = new Set(openVersions);
    for (const r of filtered) toOpen.add(r.version);
    setOpenVersions(toOpen);
    // intentional: we only want to react to search changes, not to openVersions
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.search, filtered]);

  const toggle = (version: string) => {
    setOpenVersions((prev) => {
      const next = new Set(prev);
      if (next.has(version)) next.delete(version);
      else next.add(version);
      return next;
    });
  };

  return (
    <section>
      <header className="mb-3 mt-8 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight">{ABOUT_I18N.history.title}</h2>
        <span className="rounded-full bg-success/10 px-2.5 py-0.5 text-xs font-semibold text-success">
          {releases.length} {ABOUT_I18N.history.countSuffix}
        </span>
      </header>

      <ReleaseToolbar
        filters={filters}
        totalCount={releases.length}
        filteredCount={filtered.length}
        onSearchChange={setSearch}
        onKindChange={setKind}
        onPeriodChange={setPeriod}
      />

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-10 text-center">
          <p className="text-sm font-medium text-foreground">{ABOUT_I18N.history.emptyTitle}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {ABOUT_I18N.history.emptyDescription}
          </p>
          {isFiltered && (
            <Button variant="outline" size="sm" className="mt-4" onClick={reset}>
              {ABOUT_I18N.history.clearFilters}
            </Button>
          )}
        </div>
      ) : (
        <div>
          {filtered.map((release) => (
            <ReleaseItem
              key={release.version}
              release={release}
              open={openVersions.has(release.version)}
              onToggle={toggle}
            />
          ))}
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Validar typecheck**

Run:

```bash
bun run build
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/features/about/components/ReleaseHistorySection.tsx
git commit -m "feat(about): add ReleaseHistorySection (filters + open state + auto-expand on search)"
```

---

## Task 14: Componente PlatformIdentityCard

**Files:**

- Create: `src/features/about/components/PlatformIdentityCard.tsx`

- [ ] **Step 1: Implementar o card de identidade**

Criar `src/features/about/components/PlatformIdentityCard.tsx`:

```tsx
import { Icon } from "@/components/Icon";
import { ABOUT_I18N } from "../i18n/pt-BR";

export function PlatformIdentityCard() {
  const i = ABOUT_I18N.identity;
  return (
    <section className="rounded-xl border border-border bg-card p-5 sm:p-6">
      <h1 className="flex items-center gap-2 text-base font-semibold tracking-tight">
        <Icon icon="mdi:circle-medium" size={22} className="text-success" />
        {i.productName}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">{i.tagline}</p>
      <p className="mt-2 text-sm text-muted-foreground">
        {i.maintainerPrefix}
        <a
          href={`mailto:${i.maintainerEmail}`}
          className="font-semibold text-foreground hover:underline"
        >
          {i.maintainerName}
        </a>
        .
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <SubmarkPill
          label={i.submarks.parts}
          className="bg-success/10 text-success"
          dot="bg-success"
        />
        <SubmarkPill
          label={i.submarks.service}
          className="bg-destructive/10 text-destructive"
          dot="bg-destructive"
        />
        <SubmarkPill
          label={i.submarks.industrial}
          className="bg-warning/10 text-warning"
          dot="bg-warning"
        />
      </div>
    </section>
  );
}

interface IPillProps {
  label: string;
  className: string;
  dot: string;
}

function SubmarkPill({ label, className, dot }: IPillProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium tracking-wide ${className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  );
}
```

- [ ] **Step 2: Validar typecheck**

Run:

```bash
bun run build
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/features/about/components/PlatformIdentityCard.tsx
git commit -m "feat(about): add PlatformIdentityCard (name, tagline, AILA, submarks)"
```

---

## Task 15: Componente CurrentVersionCard

**Files:**

- Create: `src/features/about/components/CurrentVersionCard.tsx`

- [ ] **Step 1: Implementar o card de destaque da versão atual**

Criar `src/features/about/components/CurrentVersionCard.tsx`:

```tsx
import type { IRelease, ReleaseKind } from "@/shared/types/about";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/Icon";
import { ABOUT_I18N, RELEASE_KIND_LABEL } from "../i18n/pt-BR";

interface IProps {
  release: IRelease;
}

export function CurrentVersionCard({ release }: IProps) {
  const dateLabel = formatDateBr(release.date);
  const badge = KIND_BADGE[release.kind];

  const handleWhatsNew = () => {
    const target = document.getElementById(`release-${release.version}`);
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <section className="relative mb-4 overflow-hidden rounded-xl border border-border bg-card p-6">
      <div className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-success to-success/40" />

      <div className="flex flex-wrap items-center gap-3">
        <span className="font-mono text-2xl font-bold tracking-tight text-success">
          v{release.version}
        </span>
        <span
          className={cn(
            "rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
            badge,
          )}
        >
          {RELEASE_KIND_LABEL[release.kind]}
        </span>
        {release.codename && (
          <span className="text-sm text-muted-foreground">
            {ABOUT_I18N.currentVersion.codenamePrefix}{" "}
            <strong className="font-semibold text-foreground">{release.codename}</strong>
          </span>
        )}
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-4 border-t border-border pt-4 sm:grid-cols-4">
        <Meta label={ABOUT_I18N.currentVersion.metaDate} value={dateLabel} strong />
        <Meta label={ABOUT_I18N.currentVersion.metaKind} value={RELEASE_KIND_LABEL[release.kind]} />
        {release.block && (
          <Meta label={ABOUT_I18N.currentVersion.metaBlock} value={release.block} />
        )}
        <Meta
          label={ABOUT_I18N.currentVersion.metaDeliveries}
          value={
            <>
              <strong className="font-semibold">{release.totalItems}</strong>{" "}
              {ABOUT_I18N.currentVersion.deliveriesSuffix}
            </>
          }
        />
      </dl>

      <button
        type="button"
        onClick={handleWhatsNew}
        className="mt-4 flex w-full items-center justify-between gap-2 border-t border-border pt-4 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <span>{ABOUT_I18N.currentVersion.whatsNew}</span>
        <Icon icon="mdi:arrow-down" size={16} />
      </button>
    </section>
  );
}

interface IMetaProps {
  label: string;
  value: React.ReactNode;
  strong?: boolean;
}

function Meta({ label, value, strong }: IMetaProps) {
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd className={cn("mt-1 text-sm text-foreground", strong && "font-semibold")}>{value}</dd>
    </div>
  );
}

const KIND_BADGE: Record<ReleaseKind, string> = {
  major: "bg-primary/10 text-primary",
  minor: "bg-info/10 text-info",
  patch: "bg-success/10 text-success",
};

function formatDateBr(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
```

- [ ] **Step 2: Validar typecheck**

Run:

```bash
bun run build
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/features/about/components/CurrentVersionCard.tsx
git commit -m "feat(about): add CurrentVersionCard (highlight card + scroll-to-release button)"
```

---

## Task 16: Componente AboutFooterCards

**Files:**

- Create: `src/features/about/components/AboutFooterCards.tsx`

- [ ] **Step 1: Implementar os 3 cards de rodapé**

Criar `src/features/about/components/AboutFooterCards.tsx`:

```tsx
import { Icon } from "@/components/Icon";
import { ABOUT_I18N } from "../i18n/pt-BR";

interface IProps {
  /** Total de releases — alimentado pela página, usado no card de documentação. */
  releaseCount: number;
}

export function AboutFooterCards({ releaseCount }: IProps) {
  const docsDescription = ABOUT_I18N.footer.docs.descriptionTemplate.replace(
    "{{count}}",
    String(releaseCount),
  );

  return (
    <section className="mt-8 grid gap-3 sm:grid-cols-3">
      <FooterCard
        icon="mdi:layers-triple-outline"
        title={ABOUT_I18N.footer.stack.title}
        description={ABOUT_I18N.footer.stack.description}
      />
      <FooterCard
        icon="mdi:email-outline"
        title={ABOUT_I18N.footer.support.title}
        description={
          <>
            <a
              href={`mailto:${ABOUT_I18N.identity.maintainerEmail}`}
              className="text-foreground hover:underline"
            >
              {ABOUT_I18N.identity.maintainerEmail}
            </a>
            <br />
            {ABOUT_I18N.footer.support.description}
          </>
        }
      />
      <FooterCard
        icon="mdi:book-open-variant"
        title={ABOUT_I18N.footer.docs.title}
        description={docsDescription}
      />
    </section>
  );
}

interface IFooterCardProps {
  icon: string;
  title: string;
  description: React.ReactNode;
}

function FooterCard({ icon, title, description }: IFooterCardProps) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h4 className="mb-1 flex items-center gap-2 text-sm font-semibold text-foreground">
        <span className="inline-flex h-6 w-6 items-center justify-center rounded bg-success/10 text-success">
          <Icon icon={icon} size={14} />
        </span>
        {title}
      </h4>
      <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>
    </div>
  );
}
```

- [ ] **Step 2: Validar typecheck**

Run:

```bash
bun run build
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/features/about/components/AboutFooterCards.tsx
git commit -m "feat(about): add AboutFooterCards (stack / support / docs)"
```

---

## Task 17: Página AboutPage + barrel

**Files:**

- Create: `src/features/about/pages/AboutPage.tsx`
- Create: `src/features/about/index.ts`

- [ ] **Step 1: Implementar a página orquestradora**

Criar `src/features/about/pages/AboutPage.tsx`:

```tsx
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { PlatformIdentityCard } from "../components/PlatformIdentityCard";
import { CurrentVersionCard } from "../components/CurrentVersionCard";
import { ReleaseHistorySection } from "../components/ReleaseHistorySection";
import { AboutFooterCards } from "../components/AboutFooterCards";
import { useChangelog } from "../hooks/useChangelog";
import { ABOUT_I18N } from "../i18n/pt-BR";

export function AboutPage() {
  const queryClient = useQueryClient();
  const { data: releases, isLoading, isError } = useChangelog();

  const retry = () => {
    queryClient.invalidateQueries({ queryKey: ["changelog"] });
  };

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{ABOUT_I18N.page.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{ABOUT_I18N.page.subtitle}</p>
      </header>

      <PlatformIdentityCard />

      {isLoading && (
        <div className="flex items-center gap-2 rounded-lg border border-dashed border-border bg-muted/20 px-4 py-6 text-sm text-muted-foreground">
          <Icon icon="mdi:loading" size={16} className="animate-spin" />
          {ABOUT_I18N.loading}
        </div>
      )}

      {isError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
          <p className="text-sm font-medium text-destructive">{ABOUT_I18N.error.title}</p>
          <p className="mt-1 text-xs text-muted-foreground">{ABOUT_I18N.error.description}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={retry}>
            <Icon icon="mdi:refresh" size={14} />
            {ABOUT_I18N.error.retry}
          </Button>
        </div>
      )}

      {releases && releases.length > 0 && (
        <>
          <CurrentVersionCard release={releases[0]} />
          <ReleaseHistorySection releases={releases} />
        </>
      )}

      <AboutFooterCards releaseCount={releases?.length ?? 0} />
    </div>
  );
}
```

- [ ] **Step 2: Criar barrel**

Criar `src/features/about/index.ts`:

```typescript
export { AboutPage } from "./pages/AboutPage";
```

- [ ] **Step 3: Validar typecheck**

Run:

```bash
bun run build
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/features/about/pages/AboutPage.tsx src/features/about/index.ts
git commit -m "feat(about): add AboutPage composing identity + current version + history + footer"
```

---

## Task 18: Rota + ROUTES constant + item no SettingsLayout

**Files:**

- Create: `src/routes/app.configuracoes.sobre.tsx`
- Modify: `src/features/shell/config/routes.ts`
- Modify: `src/features/shell/layouts/SettingsLayout.tsx`

- [ ] **Step 1: Criar o arquivo de rota**

Criar `src/routes/app.configuracoes.sobre.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { SettingsLayout } from "@/features/shell/layouts";
import { requireAuth } from "@/features/auth/guards";
import { AboutPage } from "@/features/about";

export const Route = createFileRoute("/app/configuracoes/sobre")({
  beforeLoad: ({ location }) => requireAuth(location.pathname),
  component: () => (
    <SettingsLayout>
      <AboutPage />
    </SettingsLayout>
  ),
});
```

- [ ] **Step 2: Adicionar constante CONFIG_SOBRE**

Editar `src/features/shell/config/routes.ts` — ADICIONAR após `CONFIG_ESTOQUE_ANALISE`:

```typescript
  CONFIG_SOBRE: "/app/configuracoes/sobre",
```

(Mantém alfabetação relativa ao grupo "Configurações" — pode ficar como última entrada do grupo, antes do comentário `// Loja (vitrine)`.)

- [ ] **Step 3: Adicionar item "Sobre" no SettingsLayout**

Editar `src/features/shell/layouts/SettingsLayout.tsx` — em `SETTINGS_GROUPS`, ADICIONAR um novo grupo no FINAL da lista (após "Avançado"):

```typescript
  {
    label: "Plataforma",
    items: [
      {
        label: "Sobre",
        icon: "mdi:information-outline",
        to: "/app/configuracoes/sobre",
        roles: ["Owner", "Gestor", "Vendedor", "SDR", "VendedorExterno", "Financeiro"],
      },
    ],
  },
```

- [ ] **Step 4: Validar typecheck + dev server**

Run:

```bash
bun run build
```

Expected: PASS — sem erros, incluindo a regeneração de `routeTree.gen.ts`.

Then:

```bash
bun run dev
```

Em outro terminal verificar:

- Abrir http://localhost:5173/app/configuracoes/sobre
- Se redirecionar para login: fazer login como Owner.
- Confirmar que a página renderiza com todos os blocos.

- [ ] **Step 5: Commit**

```bash
git add src/routes/app.configuracoes.sobre.tsx src/features/shell/config/routes.ts src/features/shell/layouts/SettingsLayout.tsx
git commit -m "feat(about): wire /app/configuracoes/sobre route + sidebar item"
```

---

## Task 19: Validação manual final

Esta é uma task de **verificação humana**, sem código. Use a checklist para validar a feature inteira antes de fechar.

- [ ] **Step 1: Build limpa**

Run:

```bash
bun run build
```

Expected: PASS, sem warnings novos. `dist/CHANGELOG.md` ou `dist/assets/...CHANGELOG...` presente (asset emitido pelo Vite a partir de `public/`).

- [ ] **Step 2: Smoke test no dev server (Owner)**

Run:

```bash
bun run dev
```

Abrir http://localhost:5173/app/configuracoes/sobre autenticado como **Owner** e verificar:

- [ ] Sidebar de Configurações mostra o grupo "Plataforma" com item "Sobre".
- [ ] Card de identidade aparece com 3 pílulas coloridas (verde, vermelho, amarelo).
- [ ] Card destaque mostra **"v0.36.0"**, badge **"Minor"**, codinome **"Pulse"**, data **27/05/2026**, bloco **"Bloco 4b"**, **"11 alterações"** (ou o número correto do CHANGELOG atual).
- [ ] Lista mostra **36 releases** (badge contador no topo da seção).
- [ ] Primeira release (v0.36.0) está expandida por default, mostrando blocos coloridos para Added/Changed/Notas.
- [ ] Clicar em v0.35.0 expande e mostra suas próprias categorias coloridas com bullets contendo `código inline`.
- [ ] Clicar em "O que há de novo" no card destaque rola a página suavemente até v0.36.0.
- [ ] Search "Pulse" filtra para v0.36.0 e a abre automaticamente.
- [ ] Search "PRD-051" filtra para v0.36.0 e a abre automaticamente.
- [ ] Filtro Tipo = "Patch" reduz a lista (verificar contagem casa com `grep -c "^## \[" CHANGELOG.md` filtrando patches).
- [ ] Filtro Período = "Este mês" mostra apenas releases de maio/2026.
- [ ] Limpar a busca + selects volta a 36 itens.
- [ ] Footer cards: 3 cards (Stack / Suporte / Documentação) renderizados corretamente. Card Documentação mostra "36 releases entregues" (ou número atual).
- [ ] Clicar em `suporte@ailainteligente.com` abre o cliente de email.

- [ ] **Step 3: Smoke test cross-papel**

No dev server, alternar para outros usuários mock (via storeSwitcher ou clearing localStorage). Verificar:

- [ ] **Vendedor** consegue acessar a rota — item "Sobre" aparece na sidebar de configurações.
- [ ] **Gestor**, **SDR**, **VendedorExterno**, **Financeiro** idem.
- [ ] **Logout** + acessar `http://localhost:5173/app/configuracoes/sobre` direto → redireciona para `/auth/login?next=/app/configuracoes/sobre`.

- [ ] **Step 4: Smoke test visual (light mode + mobile)**

- [ ] Trocar para light mode no menu Aparência. Cores das categorias e badges permanecem legíveis (contraste WCAG AA).
- [ ] Resize a janela para 375px (DevTools mobile). Cards empilham, grid de meta vira 2 colunas, search bar e selects empilham na toolbar.
- [ ] Linha colapsada de release oculta a coluna de data em telas pequenas (já tem `hidden sm:inline`).

- [ ] **Step 5: Smoke test de robustez**

- [ ] No DevTools, Network → simular offline → recarregar página. Banner de erro com botão "Tentar novamente" aparece. Voltar online e clicar — recarrega normalmente.
- [ ] Buscar por texto que não existe ("xyz123") → empty state com botão "Limpar filtros".

- [ ] **Step 6: Sem regressões**

- [ ] Navegar para `/app/configuracoes/perfil` e `/app/configuracoes/aparencia` — ainda funcionam normalmente.
- [ ] Navegar para `/app/configuracoes/comissoes` (uma das rotas mais complexas de configurações) — sem regressão.

- [ ] **Step 7: Tudo OK — encerramento**

Se TODOS os checkboxes acima foram marcados, a feature está validada. Caso contrário, voltar à task específica para corrigir.

Conforme spec seção 8: **não atualizar CHANGELOG nem fazer version bump neste commit** — feature pequena, será incorporada no próximo bump PATCH (v0.36.1) acumulado com outras correções.

---

## Self-review

### Spec coverage check

Verifiquei cada item das 8 seções do spec:

| Seção spec                                 | Coberto por                                                                  |
| ------------------------------------------ | ---------------------------------------------------------------------------- |
| 2 Inclui · Rota `/app/configuracoes/sobre` | Task 18                                                                      |
| 2 Inclui · Card identidade                 | Task 14                                                                      |
| 2 Inclui · Card destaque versão atual      | Task 15                                                                      |
| 2 Inclui · Search + filtros                | Tasks 8, 12, 13                                                              |
| 2 Inclui · Lista colapsável                | Tasks 11, 13                                                                 |
| 2 Inclui · Blocos coloridos por categoria  | Tasks 9, 10                                                                  |
| 2 Inclui · Footer 3 cards                  | Task 16                                                                      |
| 2 Inclui · Parser runtime                  | Tasks 3, 4, 7                                                                |
| 2 Inclui · RBAC todos internos             | Task 18 (`roles` array)                                                      |
| 4.1 Estrutura de arquivos                  | Header + Tasks 1-18                                                          |
| 4.2 Roteamento + ROUTES + nav              | Task 18                                                                      |
| 4.3 Parser do CHANGELOG                    | Tasks 3, 4                                                                   |
| 4.4 Hook useChangelog                      | Task 7                                                                       |
| 4.5 Hook useReleaseFilters                 | Task 8                                                                       |
| 4.6 Componentes                            | Tasks 9-16                                                                   |
| 4.7 Visual / tokens semânticos             | Tasks 9 (verificação de tokens), 11, 14, 15                                  |
| 5 Tratamento de erros                      | Task 10 (raw fallback), Task 13 (empty state), Task 17 (loading/error/retry) |
| 7 Plano de validação manual                | Task 19                                                                      |

### Placeholder scan

Nenhuma das frases "TBD", "TODO", "fill in details", "implement later", "similar to Task N", "add appropriate error handling" aparece no plano. Cada task tem código completo.

### Type consistency

- `IRelease`, `ReleaseKind`, `ReleaseCategory`, `IReleaseCategoryBlock` definidos em Task 2 e reusados consistentemente.
- `IReleaseFilters`, `ReleaseKindFilter`, `ReleasePeriod` definidos em Task 8 e consumidos em Tasks 12 e 13 sem desvio.
- `classifyVersion(current, previous)` definido em Task 3 e chamado em Task 4 com assinatura idêntica.
- `parseChangelog(raw)` definido em Task 4, consumido em Task 7 sem desvio.
- `renderInlineMarkdown(input)` definido em Task 5 (`.tsx`), consumido em Tasks 9 e 10 sem desvio.
- IDs DOM `release-${version}` definidos em Task 11 e usados em Task 15 (scrollIntoView) idênticos.
- `useChangelog`, `useReleaseFilters`, `applyFilters` exports condizem entre definição e consumo.
- Tokens semânticos (`success`, `warning`, `info`, `destructive`, `primary`, `muted`, `border`, `card`, `foreground`, `muted-foreground`, `accent`) reusados consistentemente entre componentes; Task 9 inclui um passo de **verificação** explícita desses tokens no `styles.css` antes de seguir.

Plano pronto.
