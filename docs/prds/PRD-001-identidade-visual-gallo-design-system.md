# PRD-001: Identidade Visual GALLO e Design System Base

## Informações Gerais

| Campo                 | Valor                                                                                                                                                                                                            |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Projeto**           | GALLO BASE DIESEL — Plataforma de Inteligência Comercial                                                                                                                                                         |
| **Repositório**       | _A definir após criação no Lovable_                                                                                                                                                                              |
| **Objetivo**          | Estabelecer a identidade visual GALLO BASE DIESEL e o design system que sustenta todos os módulos da plataforma (Central, SDR, Gestão, E-commerce), incluindo o sistema de 4 temas × 2 modos com codinomes na UI |
| **Tipo**              | Feature                                                                                                                                                                                                          |
| **Complexidade**      | Alta                                                                                                                                                                                                             |
| **Total de Fases**    | 5                                                                                                                                                                                                                |
| **Prioridade**        | Alta                                                                                                                                                                                                             |
| **Épico**             | Bloco 0 — Fundação                                                                                                                                                                                               |
| **PRDs Relacionados** | PRD-002 (Modelo Conceitual), PRD-003 (Shell e Navegação), PRD-004 (Mocks)                                                                                                                                        |
| **Implementação**     | 🟢 Lovable (scaffold visual inicial)                                                                                                                                                                             |
| **Padrão de código**  | camelCase para tokens em JS/TS; kebab-case para CSS variables; UPPER_SNAKE_CASE para constantes globais                                                                                                          |

### Critérios de Complexidade Utilizados

| Complexidade | Critérios                                                       |
| ------------ | --------------------------------------------------------------- |
| **Baixa**    | 1 arquivo, sem dependências externas, < 100 linhas              |
| **Média**    | 2-5 arquivos, banco OU integração, funcionalidade isolada       |
| **Alta**     | 5+ arquivos, múltiplas integrações, regras de negócio complexas |

> **Justificativa de Alta:** múltiplos arquivos de tokens em três camadas (primitivos, semânticos, tema), configuração de Tailwind + shadcn/ui + Iconify, ~28 componentes base customizados, suporte a **4 temas × 2 modos (8 combinações)** todos validados em WCAG 2.1 AA, página `/design-system` de documentação navegável, e impacto transversal em todos os outros 49 PRDs do projeto.

---

## Contexto do Problema

A GALLO BASE DIESEL acaba de passar por um rebranding completo (antiga Turbo Diesel) e estreia simultaneamente uma plataforma proprietária de operação e inteligência comercial. Essa convergência de eventos torna o design system **muito mais que uma camada técnica** — ele é o primeiro veículo digital de expressão da nova marca.

A arquitetura de marca GALLO é guarda-chuva com três submarcas (PARTS, SERVICE, INDUSTRIAL), cada uma com cor própria, derivada das cores da bandeira do Rio Grande do Sul. Como o MVP da plataforma atende o núcleo PARTS, mas as submarcas SERVICE e INDUSTRIAL já estão moduladas no domínio, **a UI precisa refletir a marca-mãe como dominante e permitir que as submarcas apareçam contextualmente** — como temas alternativos escolhidos pelo usuário e como chips/badges de categorização.

Sem este PRD, três problemas se materializam imediatamente:

**Cada módulo inventa seu visual.** A Central de Atendimento usaria uma paleta, a Gestão outra, o E-commerce uma terceira. O cliente perceberia "três aplicações diferentes coladas" em vez de "uma plataforma única e coerente da GALLO".

**A identidade GALLO não se traduz para o digital.** O manual de marca define preto técnico, cromia óleo diesel e cores das submarcas — mas não explica como isso vira CSS, contraste WCAG, ou estados de componente (hover, focus, disabled). É trabalho deste PRD fazer essa tradução.

**O sistema de 4 temas vira retrabalho se decidido depois.** Se os componentes nascerem hardcoded com uma paleta, retroativamente "tematizá-los" custa 10× mais. A decisão certa é nascer com a arquitetura de 3 camadas (primitivos → semânticos → tema) desde o primeiro componente.

Este PRD define a fundação visual e funcional que **todos os outros 49 PRDs** vão consumir.

---

## Conceito da Solução

### Situação Atual (As-Is)

Não existe identidade visual digital. Não existe design system. A nova marca GALLO está definida em manual estático (PDF) com aplicações de marketing (logo, banners, posts), mas sem nenhuma tradução para o ambiente de software.

### Situação Desejada (To-Be)

Um design system completo, baseado em **tokens semânticos em três camadas**, implementado via **CSS Variables + Tailwind**, com:

- Paleta de cores em três camadas (primitiva → semântica → tema), permitindo trocar a "cor de ação" do tema sem tocar em nenhum componente
- **Sistema de 4 temas × 2 modos = 8 combinações** plenamente funcionais com codinomes amigáveis na UI
- Tipografia escolhida para legibilidade em uso intenso (Saira Condensed para display, Inter para UI, JetBrains Mono para códigos OEM)
- Sistema de espaçamento, raios e sombras consistente
- ~28 componentes base prontos (botões, inputs, cards, modais, tabelas, etc.) consumindo apenas tokens semânticos
- Iconografia unificada via Iconify (sob demanda, sem bloat)
- Logo GALLO em todas as variantes (vertical, horizontal, alternativa, monocromática)
- Página `/design-system` (dev-only) que documenta tokens, temas e componentes em tempo real

### Alternativas Consideradas

| Alternativa                                                                      | Por que foi descartada                                                                                                                            |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Adotar Material Design puro                                                      | Visual genérico de SaaS, não comunica a robustez/industrialidade da GALLO                                                                         |
| Usar shadcn/ui sem customização                                                  | Funciona como base, mas precisa de tema próprio para ter a identidade GALLO                                                                       |
| Implementar 1 tema apenas e adicionar temas depois                               | Custo de "tematizar" depois é alto demais; nascer multi-tema garante arquitetura correta                                                          |
| Usar GALLO BD (fonte da logo) em toda a UI                                       | GALLO BD é proprietária, não tem suporte completo de caracteres, e não é desenhada para uso intenso em corpo de texto                             |
| Usar as cores das submarcas (vermelho/verde/amarelo) como cores principais da UI | Confunde com cores semânticas (sucesso/erro/atenção); o caminho correto é marca-mãe (preto+dourado) como base e submarcas como temas alternativos |

**Decisão:** usar **shadcn/ui como ponto de partida** (componentes acessíveis, baseados em Radix UI) e **substituir o tema completo** por tokens próprios da GALLO em três camadas; sistema de 4 temas paralelos derivados da arquitetura de marca.

---

## Identidade Visual GALLO — Aplicação na Plataforma

### Princípios de tradução do manual para o digital

A identidade GALLO no manual de marca privilegia preto absoluto + cromia óleo diesel em fundo escuro. A UI da plataforma respeita isso mas faz adaptações necessárias:

| Princípio do manual                                          | Tradução na UI                                                                                                                                  |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **Marca-mãe monocromática (preto técnico)**                  | Base institucional de toda a UI, em ambos os modos                                                                                              |
| **Cromia óleo diesel (dourado)**                             | Cor de ação no tema padrão Diesel — CTAs, links, focus, destaques                                                                               |
| **Cores das submarcas em chips/badges + temas alternativos** | Verde PARTS / Vermelho SERVICE / Amarelo INDUSTRIAL como cores de acento opcionais por preferência de usuário e como categorizadores semânticos |
| **Força, robustez, presença, profissionalismo técnico**      | Tipografia condensada em headers (Saira), corpos densos legíveis (Inter), códigos em mono (JetBrains Mono)                                      |
| **Logo em variações**                                        | Horizontal no header desktop, vertical em splash/empty states, signo isolado em favicon, social 3D em hero/marketing                            |

### Tom visual

| Atributo                     | Tradução visual na plataforma                                                     |
| ---------------------------- | --------------------------------------------------------------------------------- |
| **Força**                    | Tipografia condensada em títulos, contraste alto, sem ornamentos                  |
| **Confiabilidade**           | Espaçamento generoso entre seções, hierarquia clara, sem ruído visual             |
| **Robustez**                 | Bordas sutis (1px) e sombras curtas (não etéreas)                                 |
| **Presença**                 | Cor de ação saturada (dourado/verde/vermelho/amarelo conforme tema), nunca pastel |
| **Profissionalismo técnico** | Mono em códigos OEM, tabelas densas legíveis, ícones lineares                     |

---

## Escopo

### Incluído

- ✅ Logo GALLO em todas as variantes (vertical, horizontal, alternativa, monocromática branca e preta, signo isolado, favicon)
- ✅ Camada de **tokens primitivos**: paleta GALLO completa (institucional + cromia diesel + submarcas), escala neutra 50-950, cores semânticas funcionais (success/warning/danger/info)
- ✅ Camada de **tokens semânticos**: surface, foreground, accent, border, ring, shadow — independentes de tema
- ✅ Camada de **tema**: 4 temas (Diesel/Parts/Service/Industrial) × 2 modos (light/dark), totalizando 8 combinações
- ✅ Tipografia configurada: Saira Condensed (display) + Inter (UI) + JetBrains Mono (mono), via Google Fonts com `font-display: swap`
- ✅ Sistema de espaçamento 4pt (4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96)
- ✅ Sistema de raios de borda (none, sm, md, lg, xl, 2xl, full)
- ✅ Sistema de sombras (5 níveis, ajustados separadamente para light e dark)
- ✅ ~28 componentes base shadcn/ui customizados, todos consumindo apenas tokens semânticos
- ✅ Iconografia via Iconify (sets `mdi:`, `lucide:`, `phosphor:`) com carregamento sob demanda
- ✅ Hook `useTheme()` para alternância de tema/modo com persistência em `localStorage`
- ✅ Provider `<ThemeProvider>` no root da aplicação
- ✅ Seletor visual de tema (com codinomes UI) e modo (light/dark/auto)
- ✅ Página `/design-system` dev-only com todos os tokens e componentes navegáveis
- ✅ Validação WCAG 2.1 AA em todas as 8 combinações tema × modo
- ✅ Configuração do Tailwind para consumir CSS Variables
- ✅ Configuração do `prefers-color-scheme` na primeira visita

### Excluído

- ❌ Componentes do domínio (ChatBubble, ProductCard, OrderRow, ConversationItem) — nascem nos PRDs específicos de cada módulo
- ❌ Telas funcionais da plataforma (Inbox, Ficha, Dashboard) — são responsabilidade do PRD-003 (Shell) e dos PRDs de cada módulo
- ❌ Autenticação real e gestão de usuários — vão no PRD-003 (auth mockada) e Fase 2 (Supabase Auth)
- ❌ Templates de e-mail transacional — Fase 2
- ❌ Componentes de visualização de dados complexos (gráficos, charts) — entram no Bloco 4 (Gestão) usando Recharts
- ❌ Animações elaboradas e transições de página — fora do MVP; apenas transições padrão do shadcn
- ❌ Sons, vibração, feedback haptic — fora do escopo
- ❌ Suporte a temas customizados criados pelo usuário (paleta personalizada) — futuro
- ❌ Modo "alto contraste" para acessibilidade extrema — futuro (atual atende WCAG AA)

---

## Requisitos Funcionais

### Tokens primitivos

- **RF-001:** O sistema deve definir uma camada de tokens primitivos em `src/styles/tokens.css` contendo a paleta GALLO institucional (preto técnico, preto absoluto, cinza estrutural), a cromia óleo diesel (light/medium/dark), as cores das submarcas (parts/service/industrial), uma escala neutra completa (gray-50 a gray-950) e as cores semânticas funcionais (success/warning/danger/info), cada uma em 4 tons.
- **RF-002:** Os tokens primitivos devem ter nomes descritivos do valor, não do uso (ex: `--gallo-diesel-medium`, não `--gallo-accent`).
- **RF-003:** Os tokens primitivos não devem ser usados diretamente por nenhum componente — apenas alimentam a camada semântica.

### Tokens semânticos

- **RF-004:** O sistema deve definir tokens semânticos em `src/styles/themes.css` com nomes baseados em uso (`--surface-base`, `--text-primary`, `--accent`, `--border-default`, etc.).
- **RF-005:** Os tokens semânticos devem referenciar tokens primitivos via `var()`, nunca conter valores literais.
- **RF-006:** Componentes devem consumir apenas tokens semânticos, jamais primitivos.

### Sistema de temas

- **RF-007:** O sistema deve suportar 4 temas (`diesel`, `parts`, `service`, `industrial`) controlados pelo atributo `data-theme` no elemento `<html>`.
- **RF-008:** O sistema deve suportar 2 modos (`light`, `dark`) controlados pelo atributo `data-mode` no elemento `<html>`, independente do tema.
- **RF-009:** Cada combinação tema × modo (total 8) deve ter todos os tokens semânticos completamente definidos.
- **RF-010:** O tema padrão para novos usuários deve ser `diesel`; o modo padrão deve respeitar `prefers-color-scheme` do SO na primeira visita, com fallback `dark`.
- **RF-011:** A preferência de tema deve ser persistida em `localStorage` na chave `gallo-theme`; a preferência de modo na chave `gallo-mode`.
- **RF-012:** O sistema deve disponibilizar um hook `useTheme()` que retorna `{ mode, theme, setMode, setTheme }` com tipagem TypeScript.
- **RF-013:** O sistema deve disponibilizar um componente `<ThemeProvider>` que aplica os atributos `data-theme` e `data-mode` no root e gerencia persistência.
- **RF-014:** O sistema deve disponibilizar um componente `<ThemeSwitcher>` com seletor de tema (mostrando codinomes UI: "GALLO Diesel · Black Gold", "GALLO Parts · Forest", "GALLO Service · Crimson", "GALLO Industrial · Amber") e toggle de modo (light/dark/auto).
- **RF-015:** A troca de tema ou modo deve ser instantânea (< 50ms) e sem flash visual.
- **RF-016:** No primeiro carregamento, o tema/modo correto deve ser aplicado antes do primeiro render (script inline no `<head>`) para evitar FOUC.

### Tipografia

- **RF-017:** O sistema deve carregar três famílias tipográficas via Google Fonts: **Saira Condensed** (pesos 400, 600, 700), **Inter** (pesos 400, 500, 600, 700) e **JetBrains Mono** (pesos 400, 500).
- **RF-018:** O carregamento das fontes deve usar `font-display: swap` para evitar FOIT e ter `<link rel="preconnect">` para o Google Fonts.
- **RF-019:** Os tokens tipográficos devem definir `--font-display`, `--font-body`, `--font-mono` e uma escala de tamanhos (text-xs a text-5xl), pesos e line-heights coerentes.
- **RF-020:** O componente `<body>` deve usar `--font-body` (Inter) por padrão; componentes de título (`<h1>` a `<h6>`) devem usar `--font-display` (Saira Condensed); componentes de código (`<code>`, `<pre>`, dados OEM/SKU) devem usar `--font-mono`.

### Iconografia

- **RF-021:** O sistema deve usar **Iconify** via `@iconify/react`, suportando os sets `mdi:` (Material Design Icons), `lucide:` e `phosphor:`.
- **RF-022:** Os ícones devem ser carregados sob demanda — não embutir nenhum set completo no bundle.
- **RF-023:** A página `/design-system` deve listar ícones recomendados para contextos recorrentes (cliente, vendedor, peça, pedido, conversa, veículo, alerta, etc.).

### Logo

- **RF-024:** O sistema deve fornecer todos os arquivos da logo GALLO em SVG: horizontal (header desktop), vertical (splash, empty states), alternativa, monocromática branca, monocromática preta, signo isolado (favicon e usos compactos).
- **RF-025:** O sistema deve gerar favicons em todos os tamanhos necessários (16, 32, 48, 96, 192, 512) a partir do signo isolado.
- **RF-026:** A logo deve adaptar-se automaticamente ao modo: variante escura sobre fundos claros, variante clara sobre fundos escuros.

### Componentes base (shadcn/ui customizados)

- **RF-027:** O sistema deve instalar e customizar os seguintes componentes shadcn/ui, todos consumindo apenas tokens semânticos:

| Categoria      | Componentes                                                                     |
| -------------- | ------------------------------------------------------------------------------- |
| **Formulário** | Button, Input, Textarea, Select, Combobox, Checkbox, Radio, Switch, Label, Form |
| **Feedback**   | Toast, Alert, Skeleton, Progress                                                |
| **Overlay**    | Dialog, Sheet, Tooltip, Popover, DropdownMenu, Command                          |
| **Navegação**  | Tabs, Breadcrumb, Pagination                                                    |
| **Dados**      | Table, Badge, Avatar, Card, Separator, ScrollArea                               |
| **Date/Time**  | DatePicker                                                                      |
| **Layout**     | Stack, Inline, Grid, Container                                                  |

> ~28 componentes ao todo. Cada um deve renderizar corretamente em todas as 8 combinações tema × modo.

### Página /design-system

- **RF-028:** O sistema deve disponibilizar uma rota `/design-system` (em desenvolvimento; bloqueada/oculta em produção via flag `import.meta.env.DEV`) que renderiza:
  - Todos os tokens primitivos com nome, valor e amostra de cor
  - Todos os tokens semânticos com nome, valor resolvido no tema atual e amostra
  - Todas as combinações tipográficas com texto de exemplo
  - Escala de espaçamento visual
  - Escala de raios e sombras
  - Todos os componentes base em todos os estados (default, hover, focus, disabled, error)
  - Toggle de tema e modo na própria página, com transição visual entre combinações
  - Validador de contraste em tempo real (rótulo + razão de contraste para cada par texto/fundo)

### Acessibilidade

- **RF-029:** Todos os pares texto/fundo, em todas as 8 combinações tema × modo, devem atingir contraste mínimo **WCAG 2.1 AA (4.5:1 para texto normal, 3:1 para texto grande)**.
- **RF-030:** O `<ThemeSwitcher>` deve ser navegável por teclado, com `aria-label` adequado e estados `aria-checked`/`aria-selected` em cada opção.
- **RF-031:** O `focus ring` deve usar a cor de acento do tema ativo, com offset visível e largura mínima de 2px.
- **RF-032:** O sistema deve respeitar `prefers-reduced-motion` desabilitando animações de transição de tema quando o usuário tiver essa preferência.

---

## Requisitos Não-Funcionais

- **RNF-001 (Performance):** Tokens via CSS Variables não devem impactar render time; troca de tema deve ocorrer em < 50ms.
- **RNF-002 (Acessibilidade):** Contraste WCAG 2.1 AA em todas as 8 combinações tema × modo.
- **RNF-003 (Manutenibilidade):** Trocar um valor de paleta deve ser possível alterando apenas a camada primitiva ou de tema, sem tocar em componentes.
- **RNF-004 (Compatibilidade):** Funcionar em Chrome, Firefox, Safari e Edge nas duas últimas versões estáveis.
- **RNF-005 (Bundle):** Iconify deve carregar ícones sob demanda; nenhum set deve ser embutido inteiro no bundle inicial.
- **RNF-006 (Carregamento de fontes):** Tempo até primeiro texto utilizável (FCP/LCP) não deve degradar pela inclusão das fontes — uso obrigatório de `font-display: swap` e `<link rel="preconnect">` para o Google Fonts.
- **RNF-007 (Tema persistente):** Preferência de tema e modo deve sobreviver a refresh de página, navegação entre rotas e logout/login.
- **RNF-008 (Sem FOUC):** Carregamento da página com tema escolhido nunca deve mostrar flash de tema errado.

---

## Critérios de Aceitação

### RF-007 a RF-016: Sistema de temas e modos

```gherkin
DADO que o usuário está fazendo a primeira visita ao app
  E o sistema operacional dele tem preferência por dark mode
QUANDO o app carrega
ENTÃO o app deve aparecer em modo dark, tema diesel (default)
  E os atributos data-mode="dark" e data-theme="diesel" devem estar no <html>
  E não deve haver flash de tema diferente durante o carregamento

DADO que o usuário está no tema diesel/dark
QUANDO ele abre o ThemeSwitcher e seleciona "GALLO Parts · Forest"
ENTÃO o tema deve mudar para parts em menos de 50ms
  E a cor de acento de todos os componentes visíveis deve trocar de dourado para verde
  E o valor "parts" deve ser persistido em localStorage chave gallo-theme

DADO que o usuário escolheu tema service e modo light
QUANDO ele recarrega a página
ENTÃO o app deve carregar diretamente em tema service + modo light
  E não deve aparecer nenhum frame em outro tema/modo

DADO que o localStorage está indisponível (modo privado restrito)
QUANDO o usuário tenta trocar o tema
ENTÃO a troca deve funcionar normalmente na sessão atual
  E o sistema deve cair silenciosamente para preferência do SO na próxima visita
  E não deve lançar exceção visível ao usuário
```

### RF-004 a RF-006: Tokens semânticos consumidos corretamente

```gherkin
DADO que um desenvolvedor está implementando um novo componente
QUANDO ele precisa de cor de ação primária
ENTÃO deve usar var(--accent), nunca var(--gallo-diesel-medium) ou var(--gallo-parts) diretamente
  E o componente deve adaptar automaticamente ao trocar tema

DADO que o tema ativo é industrial
QUANDO inspeciono o valor computado de var(--accent) em qualquer componente
ENTÃO o valor resolvido deve ser #C79C2C (amarelo INDUSTRIAL)
```

### RF-027: Componentes em todos os temas e modos

```gherkin
DADO que estou em /design-system no tema diesel/dark
QUANDO inspeciono cada componente base nos estados default, hover, focus, disabled, error
ENTÃO todos devem estar visualmente coerentes, legíveis, com contraste adequado

DADO que troco para tema parts/light
QUANDO reinspeciono os mesmos componentes nos mesmos estados
ENTÃO todos devem permanecer legíveis com paridade visual e funcional
  E os componentes devem ter a mesma altura, mesma densidade, mesmo comportamento

DADO que estou em qualquer das 8 combinações
QUANDO uso o validador de contraste embutido na página /design-system
ENTÃO todos os pares texto/fundo devem reportar razão de contraste ≥ 4.5:1 (AA texto normal)
  E os pares de texto grande devem reportar ≥ 3:1
```

### RF-029 a RF-032: Acessibilidade

```gherkin
DADO que o usuário navega usando apenas o teclado
QUANDO ele dá Tab no ThemeSwitcher
ENTÃO deve aparecer um focus ring visível com a cor de acento do tema atual
  E o usuário deve conseguir mudar tema/modo sem usar mouse

DADO que o usuário tem prefers-reduced-motion ativo
QUANDO ele troca de tema
ENTÃO a transição visual deve ser instantânea (sem animação)
  E a mudança de cores deve ocorrer mesmo assim, apenas sem easing
```

### RF-028: Página /design-system

```gherkin
DADO que estou em ambiente de desenvolvimento
QUANDO acesso /design-system
ENTÃO devo ver seções para: tokens primitivos, tokens semânticos, tipografia, espaçamento, raios, sombras, ícones, componentes
  E cada componente deve aparecer em seus estados (default, hover, focus, disabled, error)
  E o toggle de tema/modo deve estar visível e funcional na própria página

DADO que estou em build de produção
QUANDO tento acessar /design-system
ENTÃO a rota deve retornar 404 ou redirecionar para /
```

### Cenários de Erro

```gherkin
DADO que o Google Fonts está indisponível (offline ou bloqueado)
QUANDO a página carrega
ENTÃO o fallback de fonte (system-ui, sans-serif, monospace) deve renderizar imediatamente
  E não deve haver tela em branco aguardando font load

DADO que um ícone do Iconify falha ao carregar
QUANDO o componente Icon tenta renderizar
ENTÃO deve mostrar um placeholder discreto (quadrado vazio com borda) sem quebrar o layout
  E o erro deve ser logado no console, não exibido ao usuário
```

---

## Fases de Implementação

| Fase | Objetivo                                                          | Arquivos Estimados |
| ---- | ----------------------------------------------------------------- | ------------------ |
| 1    | Setup base, projeto Lovable e dependências                        | 4-6                |
| 2    | Tokens primitivos e camada semântica de 8 combinações tema × modo | 3-4                |
| 3    | Tipografia, ícones e logo                                         | 4-5                |
| 4    | Componentes shadcn/ui customizados (~28 componentes)              | 28-30              |
| 5    | Página `/design-system` e validação WCAG                          | 3-4                |

### Detalhamento das Fases

#### Fase 1: Setup Base

**Objetivo:** preparar o terreno técnico e iniciar o projeto no Lovable

**Ações:**

- [ ] Criar projeto no Lovable com React + Vite + TypeScript + Tailwind CSS
- [ ] Instalar dependências: `shadcn/ui` (CLI), `@iconify/react`, `class-variance-authority`, `clsx`, `tailwind-merge`
- [ ] Configurar fontes via Google Fonts (Saira Condensed, Inter, JetBrains Mono) com preconnect
- [ ] Estruturar pastas conforme convenção feature-based (`src/shared/components/`, `src/shared/hooks/`, `src/shared/utils/`, `src/lib/`, `src/styles/`, `src/config/`)
- [ ] Configurar `tsconfig.json` com paths absolutos (`@/*`)
- [ ] Configurar ESLint e Prettier alinhados com convenções da AILA

**Validação:** projeto roda `npm run dev` sem erros; estrutura de pastas validada.

#### Fase 2: Tokens e Sistema de Temas

**Objetivo:** estabelecer a fundação visual em três camadas

**Ações:**

- [ ] Criar `src/styles/tokens.css` com **tokens primitivos**: paleta GALLO institucional, cromia diesel, submarcas, escala neutra, cores semânticas funcionais
- [ ] Criar `src/styles/themes.css` com **tokens semânticos** para as 8 combinações tema × modo, usando seletores `[data-mode="..."][data-theme="..."]`
- [ ] Configurar `tailwind.config.ts` para consumir CSS Variables (cores via `colors.*`, tipografia via `fontFamily.*`, espaçamento aplicando o sistema 4pt)
- [ ] Criar hook `useTheme()` em `src/shared/hooks/useTheme.ts` com tipos TypeScript estritos
- [ ] Criar `<ThemeProvider>` em `src/shared/components/ThemeProvider.tsx`
- [ ] Adicionar script inline no `index.html` que aplica `data-mode` e `data-theme` antes do primeiro render (anti-FOUC)
- [ ] Criar `<ThemeSwitcher>` em `src/shared/components/ThemeSwitcher.tsx` com codinomes UI

**Validação:** alternar entre 8 combinações funciona em < 50ms, persiste após reload, e não há flash visual no carregamento.

#### Fase 3: Tipografia, Ícones e Logo

**Objetivo:** identidade gráfica funcional

**Ações:**

- [ ] Confirmar carregamento das fontes em todos os pesos especificados
- [ ] Configurar Iconify com cache de ícones e validar carregamento sob demanda
- [ ] Adicionar arquivos SVG da logo GALLO em `public/logo/`: horizontal, vertical, alternativa, monocromática (branca e preta), signo isolado
- [ ] Gerar favicons em todos os tamanhos (16, 32, 48, 96, 192, 512) e configurar no `index.html`
- [ ] Criar componente `<Logo>` em `src/shared/components/Logo.tsx` que adapta variante e cor ao modo ativo
- [ ] Documentar ícones recomendados para contextos recorrentes (preparado para Fase 5)

**Validação:** logo renderiza corretamente em ambos os modos; ícones carregam sob demanda sem inflar bundle inicial.

#### Fase 4: Componentes Base (shadcn/ui customizados)

**Objetivo:** ter biblioteca pronta para os outros módulos consumirem

**Ações:**

- [ ] Instalar via shadcn CLI e customizar todos os ~28 componentes listados em RF-027
- [ ] Para cada componente: garantir que consome apenas tokens semânticos, que renderiza corretamente em todos os 8 temas × modos, e que todos os estados (default, hover, focus, disabled, error quando aplicável) estão coerentes
- [ ] Criar layout primitives (Stack, Inline, Grid, Container) em `src/shared/components/layout/`
- [ ] Configurar `cn()` utility em `src/shared/utils/cn.ts` (combinando `clsx` + `tailwind-merge`)
- [ ] Padronizar exports via barrel files (`index.ts` em cada pasta de componentes)

**Validação:** cada componente é navegável e funcional em todas as 8 combinações; nenhum hardcoded de cor em componente.

#### Fase 5: Documentação Navegável e Validação WCAG

**Objetivo:** referência viva do design system e garantia de qualidade

**Ações:**

- [ ] Criar rota `/design-system` em `src/features/design-system/` (visível apenas em `import.meta.env.DEV`)
- [ ] Implementar seções: tokens primitivos, tokens semânticos, tipografia, espaçamento, raios, sombras, ícones, componentes
- [ ] Implementar validador de contraste embutido (componente que calcula razão e marca em verde/vermelho)
- [ ] Rodar bateria de validação WCAG AA em todas as 8 combinações; ajustar tokens semânticos se algum par falhar
- [ ] Adicionar toggle de tema/modo dentro da própria página para inspeção rápida

**Validação:** validador de contraste embutido aprova todos os pares texto/fundo nas 8 combinações; rota retorna 404 em build de produção.

---

## Dependências

### PRDs Anteriores

Nenhum. Este é o PRD-001, fundação do projeto.

### Serviços Externos

| Serviço         | Tipo                                                   | Status                   |
| --------------- | ------------------------------------------------------ | ------------------------ |
| Google Fonts    | CDN de fontes (Saira Condensed, Inter, JetBrains Mono) | Disponível               |
| Iconify API/CDN | CDN de ícones sob demanda                              | Disponível               |
| Lovable         | Plataforma de scaffold visual                          | Conta a criar no kickoff |

### Decisões Pendentes

Nenhuma — todas as decisões críticas estão tomadas no briefing v1.1 e neste PRD.

---

## Cadeia de PRDs

Este PRD faz parte do épico **"Bloco 0 — Fundação"**.

| Ordem | PRD         | Título                                             | Status       | Relação                      |
| ----- | ----------- | -------------------------------------------------- | ------------ | ---------------------------- |
| **1** | **PRD-001** | **Identidade Visual GALLO e Design System Base**   | **🔄 ATUAL** | Base — não depende de nada   |
| 2     | PRD-002     | Modelo Conceitual de Domínio e Glossário           | ⏳           | Independente do PRD-001      |
| 3     | PRD-003     | Shell do App, Navegação e Layouts Base             | ⏳           | Depende de PRD-001 e PRD-002 |
| 4     | PRD-004     | Geradores de Dados Fictícios e Camada de Mocks     | ⏳           | Depende de PRD-002           |
| 5     | PRD-005     | Arquitetura de Provedores de Dados (Mock/Supabase) | ⏳           | Depende de PRD-004           |
| 6     | PRD-006     | Sistema de Roles, Permissões e Auditoria (visual)  | ⏳           | Depende de PRD-002           |
| 7     | PRD-007     | Multi-Loja: Modelagem e Operação Cross-Store       | ⏳           | Depende de PRD-002 e PRD-003 |

> **Nota:** PRD-001 e PRD-003 serão consumidos pelo Lovable no scaffold inicial. PRDs 002, 004, 005, 006 e 007 ficam para o Claude Code CLI implementar no clone local após o scaffold.

**Legenda:** ✅ Implementado | 🔄 Atual | ⏳ Pendente

---

## Considerações de Segurança

### Dados Sensíveis

Nenhum dado sensível é manipulado neste PRD. Tokens, temas e componentes são puramente visuais/estruturais.

### Acesso à Rota `/design-system`

| Ambiente                                         | Comportamento                                                                       |
| ------------------------------------------------ | ----------------------------------------------------------------------------------- |
| Desenvolvimento (`import.meta.env.DEV === true`) | Rota acessível, totalmente funcional                                                |
| Produção (`import.meta.env.DEV === false`)       | Rota retorna 404 (não renderiza componente, não vaza referências a tokens internos) |

---

## Fluxos de Usuário

### Fluxo Principal — Trocar Tema e Modo

```
[Usuário] ──▶ Abre ThemeSwitcher ──▶ Seleciona tema ──▶ Seleciona modo ──▶ UI atualiza em < 50ms
                                                                              │
                                                                              └──▶ Preferência salva em localStorage
```

**Passo a passo:**

1. Usuário clica no avatar ou ícone de configurações no header
2. Aparece dropdown com seletor de tema (4 opções com codinomes) e toggle de modo (light/dark/auto)
3. Usuário escolhe uma combinação
4. Sistema aplica imediatamente: muda `data-theme` e `data-mode` no `<html>`, salva em `localStorage`
5. Todos os componentes visíveis adaptam cores instantaneamente

### Fluxo de Exceção — `localStorage` indisponível

1. Usuário em modo privado/restrito tenta trocar tema
2. Sistema aplica a troca normalmente na sessão atual
3. Tentativa de gravar em `localStorage` falha silenciosamente (try/catch)
4. Nenhum erro aparece ao usuário
5. Próxima visita: cai para preferência do SO (`prefers-color-scheme`) e tema default `diesel`

### Fluxo de Erro — Google Fonts offline

1. Página carrega sem conseguir baixar Saira Condensed, Inter, JetBrains Mono
2. Fallbacks de sistema renderizam imediatamente (`system-ui`, `-apple-system`, `sans-serif`, `monospace`)
3. Layout não quebra; densidade muda ligeiramente
4. Quando a conectividade retorna, fontes carregam e substituem o fallback sem flash (graças ao `font-display: swap`)

---

## Convenções de Código (Referência Rápida)

> **Consulte a Seção 5 do `guia-prd.md` para a versão completa.**

| Elemento                | Convenção                                                | Exemplo                                                 |
| ----------------------- | -------------------------------------------------------- | ------------------------------------------------------- |
| **Componentes React**   | PascalCase                                               | `ThemeSwitcher.tsx`, `Logo.tsx`                         |
| **Hooks**               | camelCase + `use`                                        | `useTheme.ts`                                           |
| **Services**            | camelCase + `Service`                                    | _N/A neste PRD_                                         |
| **Pastas**              | kebab-case                                               | `design-system/`, `theme-switcher/`                     |
| **Variáveis/Funções**   | camelCase                                                | `currentTheme`, `setTheme()`                            |
| **Constantes**          | UPPER_SNAKE_CASE                                         | `DEFAULT_THEME`, `LOCALSTORAGE_KEYS`                    |
| **Interfaces**          | PascalCase + `I`                                         | `IThemeContext`, `IThemeConfig`                         |
| **Tipos union**         | PascalCase                                               | `ThemeName`, `ThemeMode`                                |
| **CSS Variables**       | kebab-case                                               | `--accent`, `--surface-base`, `--brand-parts`           |
| **Tailwind config**     | kebab-case nos custom names                              | `colors.accent`, `colors.surface-base`                  |
| **Env vars (frontend)** | `VITE_` prefix                                           | _N/A neste PRD_                                         |
| **Git commits**         | Conventional Commits                                     | `feat: add gallo design system tokens`                  |
| **Estrutura de pastas** | Feature-based                                            | `src/features/design-system/`, `src/shared/components/` |
| **Imports**             | Ordem: React → libs → components → hooks → utils → types | —                                                       |
| **Ícones**              | Iconify (`@iconify/react`)                               | `<Icon icon="mdi:cog" />`                               |
| **Tema**                | 4 temas × 2 modos obrigatórios                           | CSS Variables + atributos `data-*`                      |

---

## Notas para o Agente Desenvolvedor

> **Contexto:** Você é o Claude Opus 4.7 operando via Claude Code CLI v2.1.3 ou o Lovable. Este PRD foi criado pelo Agente Arquiteto (Claude Opus 4.7 na plataforma web). O scaffold visual inicial deste PRD será gerado pelo Lovable; refinamentos posteriores serão feitos via Claude Code CLI no clone local.

### Esclarecimento de Dúvidas

> **💬 Antes de implementar, faça perguntas para esclarecer qualquer ambiguidade sobre: requisitos funcionais, restrições técnicas, dependências, comportamentos esperados e critérios de aceitação.**

### Instruções Obrigatórias

> **⚠️ 1. ANTES DE IMPLEMENTAR:**
> "Lembre-se: explore a estrutura dos dados, planeje primeiro cada passo, analise, investigue a fundo, pense e revise tudo antes de realizar qualquer atualização ou implementação."

> **⚠️ 2. APÓS IMPLEMENTAR:**
>
> - Incrementar a versão do app seguindo [SemVer](https://semver.org/) — este PRD entrega a v0.1.0 inicial (codinome **Genesis**)
> - Criar o `CHANGELOG.md` seguindo [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) com a entrada inicial v0.1.0 Genesis
> - Renomear este arquivo adicionando `_DONE` ao final
>   Ex: `PRD-001-identidade-visual-gallo-design-system_DONE.md`
> - Atualizar a seção "Status de Implementação" com:
>   - Status: ✅ IMPLEMENTADO
>   - Data de Implementação
>   - Versão do App: v0.1.0 — Genesis
>   - Observações relevantes

### Guia de Versionamento (SemVer)

| Tipo de Mudança      | Ação                 | Exemplo       |
| -------------------- | -------------------- | ------------- |
| Correção de bug      | PATCH +1             | 0.1.0 → 0.1.1 |
| Nova funcionalidade  | MINOR +1, PATCH = 0  | 0.1.0 → 0.2.0 |
| Mudança incompatível | MAJOR +1, outros = 0 | 0.x.x → 1.0.0 |

**Codinomes da plataforma GALLO BASE DIESEL (sequência sugerida):**

| Versão     | Codinome    | Contexto                                      |
| ---------- | ----------- | --------------------------------------------- |
| **v0.1.0** | **Genesis** | **Este PRD-001 — fundação visual**            |
| v0.2.0     | Hub         | Após PRD-003 (Shell) — primeiro app navegável |
| v0.3.0     | Pilot       | Após Bloco 1 (CRM)                            |
| v0.4.0     | Compass     | Após Bloco 4 (Gestão)                         |
| v0.5.0     | Storefront  | Após Bloco 5 (E-commerce)                     |
| v1.0.0     | Heavy       | Release MVP completo                          |

🔗 Referência: https://semver.org/

### Guia de Changelog (Keep a Changelog)

Tipos de mudança a documentar:

- **Added** — novas funcionalidades
- **Changed** — mudanças em funcionalidades existentes
- **Deprecated** — funcionalidades que serão removidas
- **Removed** — funcionalidades removidas
- **Fixed** — correções de bugs
- **Security** — correções de vulnerabilidades

🔗 Referência: https://keepachangelog.com/en/1.1.0/

### Princípios de Implementação

| Princípio                                       | Descrição                                                                                                                 |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **Tokens primeiro, componentes depois**         | Nunca implementar um componente sem que os tokens semânticos consumidos por ele já existam                                |
| **Três camadas, sempre**                        | Componente → token semântico → token primitivo. Nunca pular direto para primitivo no componente                           |
| **8 combinações são primeira-classe**           | Cada componente nasce sendo testado em todos os 4 temas × 2 modos. Nada de "ajusto o tema parts depois"                   |
| **Fail gracefully em tema**                     | Se um token semântico não existir no tema/modo ativo, cair para o tema diesel sem quebrar                                 |
| **Documentar decisões finas no /design-system** | Página `/design-system` é a memória viva do PRD — qualquer decisão fina (por que esse exato tom de dourado?) vira nota lá |

### Orientações Gerais

| Aspecto                           | Orientação                                                                                                                                                       |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Fontes**                        | Carregar via Google Fonts com `font-display: swap` e `<link rel="preconnect">`. Não auto-hospedar no MVP                                                         |
| **Bundle de ícones**              | Iconify carrega sob demanda — evitar import estático de sets inteiros como `@iconify-json/mdi` (incha bundle)                                                    |
| **Tailwind config**               | Mapear cores para CSS Variables em vez de valores hex direto. Ex: `accent: 'var(--accent)'`                                                                      |
| **shadcn/ui**                     | Customizar via CSS Variables nos `*-foreground` e `*-background`. Não editar componentes raiz do shadcn para evitar conflito em upgrades                         |
| **Densidade**                     | Default `comfortable`. Reservar token `--density` para futuro modo `compact` (Central de Atendimento) — mas não implementar agora                                |
| **Cores semânticas vs submarcas** | Manter `--color-danger` distinto de `--brand-service` (ambos vermelhos, tons diferentes). Vermelho de erro nunca deve confundir com vermelho da submarca SERVICE |
| **Logo no header**                | Variante horizontal monocromática que adapta cor ao modo (preta no light, branca no dark)                                                                        |

### O que NÃO Fazer

| ❌ Evitar                                                                                                  |
| ---------------------------------------------------------------------------------------------------------- |
| Hardcodar cores em componentes (`bg-red-500`, `color: #C41E3A`) — sempre via tokens semânticos             |
| Pular a camada semântica (componente referenciando token primitivo diretamente)                            |
| Usar `--brand-service` (vermelho da submarca) como cor de erro/danger — usar `--color-danger`              |
| Implementar componente sem antes garantir paridade nas 8 combinações tema × modo                           |
| Importar set completo do Iconify (`@iconify-json/mdi` ou similar) — quebra bundle                          |
| Auto-hospedar fontes no MVP (custa tempo e não traz benefício até produção real)                           |
| Esquecer o script anti-FOUC inline no `<head>`                                                             |
| Deixar `/design-system` acessível em produção                                                              |
| Confundir codinome do tema (UI: "Black Gold") com nome técnico (`diesel`) — usar cada um em seu contexto   |
| Customizar componentes shadcn raiz (editar o gerado pelo CLI) em vez de via CSS Variables — quebra upgrade |

---

## Status de Implementação

| Campo                     | Valor       |
| ------------------------- | ----------- |
| **Status**                | ⏳ PENDENTE |
| **Data de Implementação** | -           |
| **Versão do App**         | -           |
| **Codinome**              | -           |
| **Implementado por**      | -           |
| **Observações**           | -           |

---

## Histórico

| Data       | Versão | Alteração                                                                            |
| ---------- | ------ | ------------------------------------------------------------------------------------ |
| 25/05/2026 | v1     | Criação inicial — fundação visual GALLO BASE DIESEL com sistema de 4 temas × 2 modos |

---

**AILA - Sistemas Inteligentes**
