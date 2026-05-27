# Página "Sobre" com histórico de atualizações

> **Status:** Design aprovado · pronto para writing-plans
> **Data:** 2026-05-27
> **Autor:** Edmilson Souza (AILA Sistemas Inteligentes)
> **Escopo:** PRD não-numerado · feature de transparência / institucional

---

## 1. Motivação

A plataforma já tem **36 releases** documentados em `CHANGELOG.md` (de v0.1.0 Genesis até v0.36.0 Pulse), com nível de detalhe altíssimo (Added/Changed/Fixed/Notes por release, codinomes, decisões arquiteturais). Hoje essa informação só é acessível a quem abre o arquivo no repositório.

Usuários internos (Owner, Gestor, Financeiro principalmente) precisam de uma janela dentro do próprio app para:

- Saber **qual versão estão usando agora** e o que mudou recentemente.
- Reconhecer a plataforma como produto vivo, mantido — ver cadência de entregas.
- Identificar quem é o autor/mantenedor (AILA) e como pedir suporte.
- Para o Owner especificamente: ter referência do que já foi entregue ao planejar próximos PRDs.

A página também serve como **artefato de marketing interno**: posiciona o produto, mostra a stack, comunica a estrutura de submarcas (PARTS/SERVICE/INDUSTRIAL).

## 2. Escopo

### Inclui

- Rota `/app/configuracoes/sobre` (item no menu Configurações).
- Card de **identidade da plataforma** (nome, descrição, submarcas, mantenedor).
- Card destaque da **versão atual** (versão + codinome + tipo + data + bloco + contagem de entregas + "O que há de novo" expansível).
- Seção **Histórico de Versões** com:
  - Search bar (filtra por versão, codinome, recurso).
  - Filtro por tipo (Major/Minor/Patch).
  - Filtro por período (este mês / últimos 3 meses / ano corrente / tudo).
  - Lista vertical de releases — cada uma colapsável; primeira já expandida.
- Cada release expandida mostra blocos coloridos por categoria Keep a Changelog (Added/Changed/Fixed/Removed/Deprecated/Security/Notes/Migration notes) com bullets e `code` inline.
- Rodapé com 3 cards (Stack técnica · Suporte · Documentação).
- Parser que lê `CHANGELOG.md` em runtime via `fetch('/CHANGELOG.md')`.
- RBAC: visível para todos os papéis internos (Owner, Gestor, Vendedor, SDR, Financeiro). Cliente B2B (portal) e Loja pública não veem.

### Não inclui (out of scope)

- Versão pública institucional na vitrine `/loja` (decisão: apenas app interno).
- CMS para editar o conteúdo (texto institucional fica no código).
- Comentários / reações em releases.
- Notificação toast/sino quando uma nova versão é publicada.
- Comparador entre releases (diff de funcionalidades).
- Geração de RSS/Atom feed.
- Internacionalização (apenas pt-BR).

## 3. Fluxo do usuário

1. Usuário interno clica em **Configurações** no menu lateral.
2. Vê item "Sobre" na lista (ícone `mdi:information-outline` ou similar).
3. Página carrega instantaneamente com:
   - Header com breadcrumb e título "Sobre a plataforma".
   - Card de identidade (nome + propósito + submarcas + AILA).
   - Card destaque da versão atual (v0.36.0 Pulse), com botão "O que há de novo" que rola até a release correspondente já expandida no histórico abaixo.
4. Usuário pode:
   - Rolar pela lista de 36 releases.
   - Clicar em uma linha para expandir e ver Added/Changed/Fixed/Notes daquela release.
   - Digitar na busca para filtrar (ex.: "Pulse", "PRD-051", "carteira").
   - Filtrar por tipo ou por período usando os dois selects.
   - Clicar em um dos cards de rodapé (Suporte abre `mailto:`; Documentação link para README/PRDs; Stack é só informativo).

## 4. Arquitetura

### 4.1 Estrutura de arquivos

```
src/features/about/
  pages/
    AboutPage.tsx                     # composição da página
  components/
    PlatformIdentityCard.tsx          # nome, descrição, submarcas, AILA
    CurrentVersionCard.tsx            # card destaque v0.36.0 Pulse
    ReleaseHistorySection.tsx         # search + filtros + lista
    ReleaseToolbar.tsx                # search input + 2 selects
    ReleaseItem.tsx                   # linha colapsável de uma release
    ReleaseBody.tsx                   # corpo expandido (blocos coloridos)
    ReleaseCategoryBlock.tsx          # Added / Changed / Fixed / Notes etc.
    AboutFooterCards.tsx              # Stack / Suporte / Documentação
  hooks/
    useChangelog.ts                   # TanStack Query: fetch + parse do CHANGELOG.md
    useReleaseFilters.ts              # estado local de search + tipo + período (não URL-sync)
  parser/
    parseChangelog.ts                 # função pura: markdown bruto → IRelease[]
    parseChangelog.test-fixtures.ts   # fixtures pequenas para sanity check manual
    classifyVersion.ts                # SemVer → 'major' | 'minor' | 'patch'
  i18n/
    pt-BR.ts                          # rótulos da página
  index.ts                            # barrel
```

Tipos em `src/shared/types/about.ts`:

```ts
export type ReleaseKind = "major" | "minor" | "patch";

export type ReleaseCategory =
  | "added"
  | "changed"
  | "fixed"
  | "removed"
  | "deprecated"
  | "security"
  | "notes" // "Notes" / "Notas"
  | "migration"; // "Migration notes"

export interface IReleaseCategoryBlock {
  category: ReleaseCategory;
  items: string[]; // bullets em texto markdown bruto (preservar `code`)
}

export interface IRelease {
  version: string; // "0.36.0"
  codename: string | null; // "Pulse" — null para PATCH sem codinome
  date: string; // ISO "2026-05-27"
  kind: ReleaseKind; // derivado de classifyVersion
  summary: string; // primeiro parágrafo após o cabeçalho
  block: string | null; // "Bloco 4b" se mencionado no summary, senão null
  categories: IReleaseCategoryBlock[];
  totalItems: number; // soma de items em todas as categorias
  raw: string; // markdown bruto da release (fallback se parsing falhar)
}
```

### 4.2 Roteamento

- Arquivo: `src/routes/app.configuracoes.sobre.tsx`
- Path: `/app/configuracoes/sobre`
- Guard: `requireAuth([Owner, Gestor, Vendedor, SDR, Financeiro])` — sem permissão fina específica; segue padrão das outras subpáginas de Configurações que não têm dados sensíveis.
- Não precisa de novo `resource` em `src/features/rbac/permissions/resources.ts`.

Adicionar constante `CONFIG_SOBRE: '/app/configuracoes/sobre'` em `src/features/shell/config/routes.ts`.

Adicionar item no menu lateral de Configurações em `src/features/shell/config/navigation.ts` (verificar nome exato no arquivo) — ícone `mdi:information-outline`, label "Sobre".

### 4.3 Parser do CHANGELOG

**Premissa:** O `CHANGELOG.md` segue Keep a Changelog 1.1.0 (regra de projeto, já documentada em CLAUDE.md). O parser confia nessa estrutura.

**Algoritmo:**

```
1. Fetch /CHANGELOG.md como texto (publicado pelo Vite como asset estático).
2. Tokenizar por linhas.
3. Identificar releases via heading H2: linha que casa regex
   /^##\s+\[(\d+\.\d+\.\d+)\]\s+[—-]\s+(\S+)\s+[·•]\s+(\d{4}-\d{2}-\d{2})/
   capturando version, codename, date.
   - Variações: "## [0.1.0] — Genesis · 2026-04-12"
   - Codename é null se não houver "— Nome ·" entre [vers] e data.
4. Cada release vai da sua linha H2 até a linha imediatamente anterior à próxima H2 (ou EOF).
5. Dentro do bloco:
   - **Summary** = todas as linhas de texto contíguas entre a linha H2 e a primeira H3, ignorando linhas em branco no início/fim. Múltiplos parágrafos são unidos em um único `summary` separados por `\n\n`. Se não houver texto antes da primeira H3, `summary = ''`.
   - Extrair "Bloco Xx" do summary via regex `/Bloco\s+(\d+\w?)/i` (case-insensitive) — captura "Bloco 4b", "Bloco 1", etc. Se ausente, `block = null`.
   - Cada H3 ("### Added", "### Changed", "### Fixed", "### Removed", "### Deprecated", "### Security", "### Notes", "### Notas", "### Migration notes", "### Notas") inicia um bloco de categoria.
   - Mapear título → ReleaseCategory (case-insensitive, pt e en):
     "Added" → 'added'
     "Changed" → 'changed'
     "Fixed" → 'fixed'
     "Removed" → 'removed'
     "Deprecated" → 'deprecated'
     "Security" → 'security'
     "Notes" | "Notas" → 'notes'
     "Migration notes" | "Notas de migração" → 'migration'
   - Bullets são extraídos como linhas que começam com `- ` ou `* `.
     Sub-bullets (indentados) ficam concatenados ao item pai com `\n  ` para preservar hierarquia.
   - Bullets que NÃO começam com `-`/`*` (parágrafos soltos) são ignorados pelo parser de items mas ficam preservados em `raw`.
6. Calcular kind via classifyVersion(currentVersion, previousVersion):
   - Comparar com a release imediatamente anterior na lista (não com semver-major-zero rules — usar majorish: se MAJOR mudou → 'major'; se MINOR mudou → 'minor'; se PATCH mudou → 'patch').
   - Primeira release (v0.1.0) é classificada como 'major' por default.
7. totalItems = soma de categories[i].items.length.
8. Ordenar releases em ordem descendente por versão (mais recente primeiro).
9. Retornar IRelease[].
```

**Fallback de robustez:** se uma release falha no parsing detalhado, ainda assim o item aparece na lista com apenas version+codename+date+raw (renderizado como `<pre>` ao expandir). Nunca quebra a página.

**Performance:** o parsing roda **uma vez** ao montar a página (cache TanStack Query `staleTime: Infinity` na chave `['changelog']`). Para 36 releases + ~3700 linhas, o custo é insignificante (<10ms estimado).

### 4.4 Hook de dados

```ts
// useChangelog.ts
export function useChangelog() {
  return useQuery({
    queryKey: ["changelog"],
    queryFn: async (): Promise<IRelease[]> => {
      const res = await fetch("/CHANGELOG.md");
      if (!res.ok) throw new Error("Failed to fetch changelog");
      const raw = await res.text();
      return parseChangelog(raw);
    },
    staleTime: Infinity,
  });
}
```

**Asset pipeline:** o `CHANGELOG.md` precisa ser servido pelo Vite na raiz pública. Opções:

- **Opção A (recomendada):** copiar `CHANGELOG.md` para `public/CHANGELOG.md` via um pequeno script no `package.json` (`"prebuild": "cp CHANGELOG.md public/CHANGELOG.md && cp CHANGELOG.md public/changelog.md"` — usar `bun` ou Node para portabilidade Windows: `"prebuild": "node scripts/copy-changelog.mjs"`).
- **Opção B:** plugin Vite custom que serve o arquivo em dev e copia em build. Mais complexo; B não justifica.
- **Decisão:** Opção A com um script `scripts/copy-changelog.mjs` simples (node), invocado por `predev`, `prebuild` e `prebuild:dev`. Compatível com Windows e bash.

Adicionar `public/CHANGELOG.md` ao `.gitignore`.

### 4.5 Hook de filtros

```ts
// useReleaseFilters.ts
type Filters = {
  search: string;
  kind: "all" | ReleaseKind;
  period: "all" | "thisMonth" | "last3Months" | "thisYear";
};
```

Estado **local com useState** (não URL-sync). Justificativa: a página é leitura institucional, raramente compartilhada via link. URL-sync adiciona complexidade sem ROI claro. Pode virar URL-sync se houver demanda.

Função `applyFilters(releases, filters)`:

1. `kind === 'all'` → não filtra; senão `r.kind === kind`.
2. `period`:
   - `thisMonth` → release.date no mês corrente.
   - `last3Months` → últimos 90 dias.
   - `thisYear` → ano corrente.
   - `all` → não filtra.
3. `search`:
   - Vazio → não filtra.
   - Normalizar (lowercase + sem acento) e procurar em: `version`, `codename`, `summary`, e em qualquer `categories[*].items[*]`.
   - Se houver hit em items: a release **abre automaticamente expandida** após filtro (estado de UI controlado pelo `ReleaseHistorySection`).

### 4.6 Componentes

- **`AboutPage`** — orquestra: chama `useChangelog`, renderiza `PlatformIdentityCard`, `CurrentVersionCard`, `ReleaseHistorySection`, `AboutFooterCards`. Trata loading (skeleton) e erro (banner com botão "Tentar novamente").
- **`PlatformIdentityCard`** — texto institucional fixo (vem de `pt-BR.ts`). Submarcas como `Badge` da shadcn com cores do design system (PARTS verde, SERVICE vermelho, INDUSTRIAL amarelo). Conteúdo:
  - Título: "GALLO BASE DIESEL"
  - Descrição: "Plataforma de inteligência comercial para distribuidora de peças pesadas, posicionada acima do ERP DINTEC."
  - Linha: "Mantida por [AILA Sistemas Inteligentes](mailto:edmilson@ailainteligente.com)."
  - 3 pílulas de submarcas.
- **`CurrentVersionCard`** — recebe a release `[0]` (mais recente) e exibe destaque visual:
  - Tag grande `v0.36.0` (font mono, accent color).
  - Badge de tipo (Major/Minor/Patch).
  - Codinome em destaque.
  - Grid 4 colunas com Data / Tipo / Bloco / Entregas (skeleton se bloco for null — grid vira 3 colunas).
  - Botão "O que há de novo →" que (a) garante que a versão atual esteja no `openVersions` set do `ReleaseHistorySection` e (b) faz `scrollIntoView({ behavior: 'smooth', block: 'start' })` no nó DOM correspondente — usando `id={`release-${version}`}` no `ReleaseItem` e `document.getElementById` no handler. Sem refs cross-component complexos.
- **`ReleaseHistorySection`** — gerencia o array completo, aplica filtros, renderiza `ReleaseToolbar` + lista de `ReleaseItem`. Mantém estado `openVersions: Set<string>` (controlado, começa com `[releases[0].version]`).
- **`ReleaseToolbar`** — `<Input>` para search, dois `<Select>` da shadcn, contagem ("36 releases" / "5 de 36 releases" quando filtrado).
- **`ReleaseItem`** — linha clicável (`<button>` por acessibilidade) + `<ReleaseBody>` condicional. Quando colapsada, mostra: versão + badge tipo + codinome + data + "N itens" + chevron.
- **`ReleaseBody`** — summary em parágrafo + blocos `ReleaseCategoryBlock` na ordem fixa: Added → Changed → Fixed → Removed → Deprecated → Security → Migration → Notes.
- **`ReleaseCategoryBlock`** — bloco colorido com border-left e gradient sutil; título uppercase + contagem; lista de bullets. Bullets podem conter `code` markdown (`` `foo` ``) que renderiza como `<code>` com style. **Não** suportar markdown completo — só inline code, negrito (`**`) e itálico (`*`). Implementação: regex simples no `ReleaseCategoryBlock`, sem dependência markdown.
- **`AboutFooterCards`** — 3 cards estáticos:
  - **Stack técnica:** lista (React 19 · TanStack Router · Tailwind v4 · shadcn/ui · TanStack Query · Vercel).
  - **Suporte:** linha "suporte@ailainteligente.com" como `mailto:` + "Resposta em 1 dia útil".
  - **Documentação:** "50 PRDs catalogados", contador dinâmico de releases ("`{releases.length}` releases entregues"). Link para a rota `/design-system` (dev-only — esconder em produção via `import.meta.env.DEV`) ou para um anchor de "ver changelog completo" que abre `/CHANGELOG.md` em nova aba.

### 4.7 Visual

Segue o design system existente — **somente tokens semânticos** (`bg-card`, `text-foreground`, `border-border`, etc.), nunca `--gallo-*` direto. Cores semânticas para badges:

- Major → `bg-purple-500/10 text-purple-500` (ou token semântico equivalente — verificar se existe `--purple` no design system; se não, usar `--primary` da submarca ou definir nova variável).
- Minor → `bg-info/10 text-info` (info = azul).
- Patch → `bg-success/10 text-success` (success = verde do PARTS).
- Categorias: Added=success, Changed=warning, Fixed=info, Removed/Deprecated=destructive, Security=destructive com tom diferente, Notes/Migration=primary/neutro.

**Importante:** validar antes da implementação quais tokens já existem em `src/styles.css` e ajustar a paleta de tipos para reusar o que tem.

## 5. Tratamento de erros e edge cases

- **Fetch falha (404, network):** banner inline com "Não foi possível carregar o histórico" + botão "Tentar novamente" que invalida a query. Card de identidade e card "Stack técnica" continuam visíveis (não dependem do changelog).
- **Parser falha em uma release específica:** essa release aparece na lista mas o body é o `raw` markdown renderizado como `<pre>` rolável com nota "Conteúdo cru exibido por limitação de formatação."
- **CHANGELOG vazio ou apenas com o header:** mostrar empty state com "Nenhuma release publicada ainda."
- **Filtros sem resultado:** empty state na seção de histórico com botão "Limpar filtros".
- **Versão atual = primeira release (v0.1.0):** `kind = 'major'` por convenção; classificação SemVer normal a partir dali.
- **Bloco não identificável no summary:** card destaque exibe 3 colunas em vez de 4.
- **`mailto:` no PlatformIdentityCard:** se o usuário não tiver cliente de email default, click não faz nada — comportamento padrão do navegador, aceitável.

## 6. Decisões e trade-offs

| Decisão                                                    | Alternativa rejeitada               | Por quê                                                                                                                                                 |
| ---------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Parsing em runtime do CHANGELOG.md                         | Array TypeScript curado             | Confirmado pelo usuário. Fonte única de verdade, zero manutenção dupla.                                                                                 |
| Parser próprio (sem lib markdown)                          | `marked` / `remark`                 | Estrutura controlada (Keep a Changelog), bundle menor (zero deps extras), regex simples cobrem 100% dos casos atuais.                                   |
| Estado de filtros em useState                              | URL-sync via TanStack Router        | Página é leitura institucional, raramente linkada. Adicionar URL-sync depois é trivial.                                                                 |
| TanStack Query com `staleTime: Infinity`                   | Sem cache (refetch a cada mount)    | Changelog não muda durante a sessão. Cache global evita re-parse.                                                                                       |
| Asset estático via `public/CHANGELOG.md` + script de cópia | Importar com `?raw` do Vite         | `?raw` funcionaria mas o arquivo vira parte do bundle JS (~85KB), inflando o initial load. Asset estático é cacheável separadamente pela CDN da Vercel. |
| Todos os papéis internos podem ver                         | Apenas Owner                        | É conteúdo institucional, não sensível. Vendedor saber a versão atual ajuda em chamados de suporte.                                                     |
| Sem item no menu principal (sidebar topo)                  | Item dedicado fora de Configurações | Confirmado pelo usuário — vive em Configurações.                                                                                                        |
| Sem versão pública na vitrine                              | Página `/loja/sobre` ou similar     | Out of scope explícito. Pode ser feito depois reutilizando os componentes.                                                                              |

## 7. Plano de validação manual

Após implementação:

1. Build (`bun run build`) sem erros TS e sem warning de asset não encontrado.
2. `bun run dev` → navegar para `/app/configuracoes/sobre` autenticado como Owner.
3. Verificar:
   - Card de identidade renderiza com 3 pílulas coloridas.
   - Card destaque mostra "v0.36.0 — Pulse" como **Minor**, 27 mai 2026.
   - Lista mostra 36 releases na ordem correta (mais recente em cima).
   - Primeira release (v0.36.0) está expandida por default.
   - Clicar em v0.35.0 expande e mostra Added/Changed/Notes coloridos.
   - Search por "Pulse" retorna apenas v0.36.0 expandida.
   - Search por "PRD-051" retorna v0.36.0 expandida.
   - Filtro tipo=Patch + período=Tudo retorna apenas releases PATCH (verificar contagem condiz com CHANGELOG).
   - Footer cards: Stack list correta; mailto: suporte abre cliente padrão.
4. Trocar para Vendedor → página continua acessível.
5. Logout → tentar acessar a URL diretamente → redireciona para login (guard padrão).
6. Light mode → verificar contraste das categorias coloridas.
7. Mobile (resize para 375px) → cards empilham; grid de meta vira 2x2.

## 8. Pós-implementação

- Mensagem de commit sugerida: `feat(about): add Sobre page with platform info and release history`
- Após merge, considerar **version bump PATCH** (v0.36.1) — feature pequena, não-substantiva, não requer codinome novo.
- Não atualizar CHANGELOG no commit da feature em si — registrar no próximo bump.
