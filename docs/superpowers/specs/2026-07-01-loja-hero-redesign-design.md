# Hero enriquecido da loja (`/loja`) — Design

> Data: 2026-07-01 · Feature: `feat/loja-hero-redesign` · Escopo: A (hero enriquecido, sem sistema de campanhas)

## Problema

A home pública da loja (`/loja`) tem um hero funcional mas visualmente simples
(`StorefrontHero.tsx`): gradiente estático no token `primary`, 2 ícones
decorativos com opacidade baixa, headline/subheadline/CTAs fixos. Não há
parallax, carrossel ou partículas — o PRD-060 original (MVP da vitrine) não
especificava esses efeitos. O pedido agora é dar um "adiantado" visual nessa
seção: parallax, carrossel, partículas.

Adicionalmente, o reconhecimento do código encontrou um bug lateral relevante:
`useStorefrontTheme` aplica `data-theme="parts"` via `useEffect` (depois do
primeiro paint), então o hero pode piscar brevemente com a cor do tema
guarda-chuva (âmbar/dourado, `--gallo-diesel-dark`) antes de assumir o verde
PARTS esperado — provável causa do hero aparecer dourado no screenshot que
motivou este pedido.

## Comportamento (escopo A)

Mantém o **conteúdo** do hero como está hoje (headline/subheadline/CTAs/
indicadores fixos, vindos de `IStorefrontConfig.hero`) e adiciona **camadas
visuais**:

1. **Partículas 3D** (three.js) — campo de partículas em verde PARTS, ao fundo.
2. **Carrossel de fundo** — 3-4 painéis ilustrados/abstratos em crossfade
   automático, atrás do overlay de gradiente.
3. **Parallax** — o conteúdo textual e a camada de partículas se deslocam em
   velocidades diferentes no scroll; leve reação ao mouse em desktop.
4. **Fix do FOUC de tema** — `data-theme="parts"` passa a ser aplicado antes do
   primeiro paint para rotas `/loja/*`, eliminando o flash âmbar→verde.

### Fora de escopo (decisão para esta rodada)

- **Hero-slider com múltiplos slides/campanhas** (headline/CTA por slide,
  editor de campanhas no admin). Fica registrado como possível fase 2 — este
  design não toca em `IStorefrontConfig` (ver "Sem mudança de dados" abaixo).
- **Carrossel fotográfico** (fotos reais de peças/frota/oficina). Não há
  fotografia da GALLO disponível no repositório; o carrossel desta entrega usa
  painéis ilustrados/abstratos (ícones/padrões gráficos), sem depender de
  assets externos. Migrar para fotos reais é uma troca de conteúdo futura, não
  estrutural.
- **Edição no admin** (`StorefrontConfigPage.tsx`) das novas camadas — os
  efeitos são globais/automáticos nesta entrega, não configuráveis por loja.

## Arquitetura técnica

`StorefrontHero.tsx` (`src/features/storefront/components/StorefrontHero.tsx`)
passa a orquestrar 4 camadas empilhadas (fundo → frente), preservando a
assinatura de props atual (`hero`, `onSearchFocus`):

```
<section>              ← container relative/isolate, como hoje
  <HeroParticles />     ← camada 1: three.js, lazy, verde PARTS
  <HeroImageCarousel /> ← camada 2: embla, crossfade automático, decorativo
  <overlay de gradiente/imagem>  ← camada 3: idêntico ao atual
  <conteúdo textual>    ← camada 4: headline/CTAs/indicadores + parallax leve
</section>
```

### Componentes novos

1. **`src/features/storefront/components/hero/HeroParticles.tsx`**
   - three.js, padrão idêntico a
     `src/features/auth/brand-backgrounds/MeshWaveBackground.tsx`: `InstancedMesh`,
     animação via `requestAnimationFrame`, cleanup de RAF/`ResizeObserver` no
     unmount.
   - Cor das partículas recebida via prop (resolve o token `--primary` no
     momento do mount — nunca hex fixo no componente).
   - `React.lazy` + `<Suspense fallback={null}>` no ponto de uso (mesmo padrão
     de `BrandPanel.tsx`).
   - Guards de desativação (ver `heroMotion.ts` abaixo): não renderiza se
     `prefers-reduced-motion: reduce`, se WebGL não disponível, ou se a
     viewport tiver menos de 480px de largura (heurística de custo/benefício
     em celulares de entrada — abaixo desse limite as partículas não
     compensam o custo de CPU/bateria).

2. **`src/features/storefront/components/hero/HeroImageCarousel.tsx`**
   - Usa `embla-carousel-react` (já instalado, ainda sem consumidor real no
     projeto).
   - Autoplay **sem** adicionar a lib `embla-carousel-autoplay`: `setInterval`
     chamando `emblaApi.scrollNext()`, limpo no unmount.
   - Puramente decorativo: `pointer-events-none`, sem setas/dots visíveis,
     `aria-hidden="true"`.
   - Pausa (não inicia o `setInterval`) quando `prefers-reduced-motion: reduce`.
   - Conteúdo dos painéis: 3-4 composições ilustradas (ícones Iconify em
     arranjos maiores/diagonais, na linha estética dos ícones decorativos já
     usados hoje — `mdi:engine`, `mdi:car-brake-alert` — só que mais elaboradas),
     definidas como um array estático no próprio componente (sem vir do
     config).

3. **`src/features/storefront/engine/heroMotion.ts`** (novo — lógica pura,
   testável)
   - `shouldEnableHeroEffects({ reducedMotion, hasWebGL, viewportWidth }): boolean`
     — decide se a camada de partículas 3D deve montar.
   - `computeParallaxOffset({ scrollY, mouseX, mouseY, maxOffset }): { x, y }`
     — clamp/interpolação pura, sem tocar DOM. `maxOffset` fica na casa de
     12-20px (efeito sutil — não pode deslocar o layout de forma perceptível
     nem sobrepor conteúdo).
   - Consumidos por um hook fino `useParallaxOffset` (dentro de
     `components/hero/`) que só faz a ponte com `scroll`/`mousemove`
     (throttle via `requestAnimationFrame`) e chama a função pura acima.

### Sem mudança de dados

`IStorefrontConfig.hero` (`src/shared/types/storefront.ts:12-19`) **não muda**.
As novas camadas (partículas, carrossel, parallax) não são configuráveis por
loja nesta entrega — ligam/desligam apenas por condição de runtime (WebGL,
`prefers-reduced-motion`, largura de viewport), decidida em `heroMotion.ts`,
não por dado vindo do provider. Isso mantém o escopo 100% frontend: sem
migration, sem mudança de provider mock/Supabase, sem novo campo no admin.

### Fix do FOUC de tema

O script anti-FOUC inline no `<head>` do `index.html` já aplica
`data-theme`/`data-mode` antes do primeiro paint lendo do `localStorage`
(chaves de `LOCALSTORAGE_KEYS`). Esse script passa a checar também
`window.location.pathname` no boot: se o path começar com `/loja`, força
`data-theme="parts"` independentemente do valor salvo no `localStorage` (que é
o tema do SaaS logado, irrelevante para a loja pública). Isso replica no boot
o que `useStorefrontTheme.ts` já faz depois — o hook não muda, só deixa de ser
a *primeira* fonte de verdade.

## Performance e degradação

- **Partículas**: só montam se `shouldEnableHeroEffects` retornar `true`
  (WebGL disponível, sem `prefers-reduced-motion`, viewport ≥ heurística
  mínima). Falha de WebGL ou erro de inicialização do three.js é capturado
  (`try/catch` no efeito de mount) e degrada silenciosamente para "sem
  partículas" — nunca quebra o hero.
- **Carrossel**: leve (CSS transform via embla), roda em qualquer dispositivo;
  pausa com `prefers-reduced-motion`.
- **Lazy loading**: `HeroParticles` via `React.lazy`, não bloqueia o LCP do
  hero (headline/CTA renderizam imediatamente; a camada de partículas "aparece
  por cima" quando o chunk carrega).
- **Parallax**: cálculo O(1) por frame via função pura, aplicado só com
  `transform` (sem reflow), throttled a 1x por frame com `requestAnimationFrame`.

## Acessibilidade

- Todas as camadas decorativas (`HeroParticles`, `HeroImageCarousel`, ícones)
  levam `aria-hidden="true"` — não competem com o texto real no leitor de
  tela.
- `prefers-reduced-motion: reduce` desliga partículas, parallax e autoplay do
  carrossel (a regra global de `styles.css:340-346` já mata `transition`/
  `animation` CSS; os efeitos JS-driven daqui usam o guard pontual, no mesmo
  padrão de `MeshWaveBackground`/`EmbersBackground`).
- Contraste do texto sobre as novas camadas: o overlay de gradiente (camada 3)
  é preservado exatamente como hoje — garante legibilidade do headline/CTAs
  independentemente do que estiver rodando nas camadas 1-2 atrás dele.

## Testes e gates

- **TDD** nas funções puras de `src/features/storefront/engine/heroMotion.ts`
  (`shouldEnableHeroEffects`, `computeParallaxOffset`) — casos: reduced-motion
  ligado, sem WebGL, viewport estreita, combinações, clamp de offset nos
  limites.
- Sem testes de unidade para o canvas/WebGL em si (padrão já aceito no projeto
  para `brand-backgrounds/`).
- Gates: `bun run test` (Vitest) + `bun run build` (Vite). `tsc --noEmit` tem
  baseline de erros pré-existentes — avaliar só o delta dos arquivos novos
  (`git diff --name-status main...HEAD --diff-filter=A`).
- Validação manual do usuário no navegador (não abrir preview automatizado —
  o usuário testa visualmente).

## Deploy

- Sem migration, sem Edge Function — mudança 100% frontend (componentes +
  tipo `IStorefrontConfig` + script anti-FOUC no `index.html`).
- PR normal, sem merge sem autorização do dono.
