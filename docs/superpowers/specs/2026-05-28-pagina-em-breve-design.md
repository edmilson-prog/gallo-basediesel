# Design — Página "Em Breve" (Coming Soon) GALLO Base Diesel

> Data: 2026-05-28
> Status: aprovado para implementação
> Codinome sugerido (MINOR): a definir no version bump

## Objetivo

Criar a página pública de "em breve / em construção" da plataforma GALLO Base Diesel,
servida na **raiz `/`**, com fundo animado de múltiplos efeitos (Abordagem B —
canvases empilhados) e identidade multimarca animada. A página é a cara pública da
plataforma durante a fase de construção.

## Decisões fechadas (brainstorming)

| Tema | Decisão |
|------|---------|
| Propósito | Coming soon público (com elementos de "em construção") |
| Rota | Raiz `/` — **sempre** renderiza a página, para todos (logados ou não). Remove o redirect por auth do `index.tsx`. |
| Acesso ao app | Apenas por rotas diretas (`/app`, `/loja`, `/auth`). Não há link para elas a partir desta página. |
| Efeitos de fundo | **Abordagem B** — 4 camadas empilhadas, cada uma com seu próprio componente/loop |
| Identidade visual | **Multimarca animado** — ciclo entre Parts (verde), Service (vermelho), Industrial (amarelo) sobre base Black Gold escura |
| Conteúdo funcional | Captura de e-mail + contagem regressiva + barra de progresso + contato/redes |
| Origem dos componentes de partículas | **magic MCP** (rede conectada + brasas); aurora e grid em CSS/SVG nativo |

## Rota e acesso

- `src/routes/index.tsx` deixa de fazer `beforeLoad`/`redirect` e passa a renderizar
  `<ComingSoonPage />` em tela cheia, **fora** do app shell (sem header/sidebar).
- O `index.html` (anti-FOUC, meta tags) não muda.
- As rotas `/app/*`, `/loja/*`, `/auth/*`, `/design-system` permanecem inalteradas e
  acessíveis por URL direta.
- A página força modo escuro próprio e sua paleta multimarca, independente do
  `data-theme`/`data-mode` global (é um splash branded). Não consome o `ThemeProvider`.

## Estrutura de arquivos

Segue o padrão real da feature existente `src/features/auth/` (componentes em
**PascalCase**, hooks `useXxx`, demais arquivos lowercase). Observação: diverge da
convenção kebab-case do CLAUDE.md global em favor da consistência com o código atual.

```
src/features/coming-soon/
├── ComingSoonPage.tsx      # composição: monta camadas + conteúdo
├── AuroraLayer.tsx         # camada 1 — gradiente aurora (CSS)
├── GridLayer.tsx           # camada 2 — grid técnico (CSS)
├── ParticleNetwork.tsx     # camada 3 — rede de partículas (canvas, base magic MCP)
├── EmberField.tsx          # camada 4 — brasas subindo (canvas, base magic MCP)
├── Countdown.tsx           # contagem regressiva
├── EmailCapture.tsx        # input + botão, submit mock → toast sonner
├── useBrandCycle.ts        # hook do ciclo multimarca (accent RGB animado)
└── config.ts               # data de lançamento, % progresso, contatos
```

## Camadas de efeito (z-index crescente, fundo → frente)

Todas as camadas são `position: fixed; inset: 0; pointer-events: none` e ficam atrás do
conteúdo (`z-index` do conteúdo maior). Cada uma lê o accent multimarca atual.

1. **AuroraLayer** (z-1) — 3 blobs de `radial-gradient` com `filter: blur`, `mix-blend-mode: screen`,
   animados por `@keyframes` (drift). Cor do accent + dourado base. CSS puro.
2. **GridLayer** (z-2) — malha blueprint via `linear-gradient` repetido (`background-size`),
   `mask-image` radial para fade nas bordas, `@keyframes` de flutuação lenta. CSS puro.
3. **ParticleNetwork** (z-3) — `<canvas>`; nós flutuantes com linhas entre vizinhos próximos,
   repulsão ao mouse. Base: componente do **magic MCP**, adaptado para ler o accent e respeitar
   densidade responsiva.
4. **EmberField** (z-4) — `<canvas>`; partículas tipo brasa subindo do rodapé com glow e fade.
   Base: componente do **magic MCP**, adaptado.

## Identidade multimarca animada (`useBrandCycle`)

- Ciclo entre 3 marcas a cada ~6s: Parts `#1E7A3C` → Service `#C8262C` → Industrial `#C79C2C` → repete.
- O hook mantém uma cor atual interpolada (lerp por frame) rumo à cor-alvo e escreve um
  CSS custom property **escopado ao container da página** (ex. `--coming-accent: r, g, b`).
- Consumidores (camadas e conteúdo) usam `rgb(var(--coming-accent))` / `rgba(var(--coming-accent), a)`.
- Canvases leem o RGB atual via ref exposto pelo hook (sem custo de parse de CSS por frame).
- Base permanece Black Gold (preto técnico `#08090c` + dourado `#C9A24A` como cor secundária fixa).

## Conteúdo central (`ComingSoonPage`)

Empilhado e centralizado (`100dvh`, flex column):

1. **Logo/wordmark** — logo marca-mãe (branca) ou GOTA 3D, com entrada animada e glow no accent.
2. **Badge** — "Inteligência comercial · em construção".
3. **Headline + subtítulo** — texto institucional GALLO (pt-BR).
4. **Barra de progresso** — `progressPercent` do `config.ts`, fill animado, glow no accent.
5. **Countdown** — 4 células (dias/horas/min/seg) até `launchDate` do `config.ts`, `aria-live="polite"`.
6. **EmailCapture** — `react-hook-form` + `zod` (validação de e-mail). Submit é **mock**:
   dispara toast `sonner` ("Você está na lista!") e limpa o campo. Sem backend (Fase 1).
7. **Contato/redes** — WhatsApp, Instagram, e-mail, telefone. Valores de `config.ts` (placeholders
   configuráveis até o usuário fornecer os reais).
8. **Rodapé** — "GALLO Base Diesel · Frederico Westphalen/RS" + versão (de `package.json`/constante).

## Config (`config.ts`)

```ts
export const COMING_SOON = {
  launchDate: "2026-07-15T12:00:00-03:00", // placeholder — ajustar
  progressPercent: 75,                       // placeholder — ajustar
  contacts: {
    whatsapp: "https://wa.me/55XXXXXXXXXXX", // placeholder
    instagram: "https://instagram.com/...",  // placeholder
    email: "contato@gallobasediesel.com.br", // placeholder
    phone: "(55) 0000-0000",                  // placeholder
  },
} as const;
```

## Acessibilidade e performance (salvaguardas da Abordagem B)

- **`prefers-reduced-motion: reduce`** — não inicia os `requestAnimationFrame` dos canvases nem
  as animações de drift; mantém aurora/grid estáticos e cores fixas (sem ciclo). Conteúdo 100% legível.
- **Mobile (`< 700px`)** — reduz densidade da rede (~38 nós) e **desativa** o EmberField; aurora/grid mantidos.
- **`visibilitychange`** — pausa todos os loops quando a aba está oculta; retoma ao voltar.
- **Pareamento de loops** — cada canvas cancela seu `rAF` no unmount (cleanup no `useEffect`).
- **Semântica/contraste** — input com `<label>`, botão com texto, foco visível; contraste do texto
  sobre fundo escuro validado (WCAG AA). Canvases são decorativos (`aria-hidden`).

## Assets (logos)

`docs/images/logos/` não é servido em produção. Copiar para `public/logos/` as artes necessárias:
- Marca-mãe branca (já existe `public/logos/logo-horizontal-white.png`) e/ou
- `GOTA - 3D.png` → `public/logos/gota-3d.png` (se usada no splash).

Referenciar via caminho público (`/logos/...`).

## Fora de escopo (YAGNI)

- Backend/persistência da captura de e-mail (Fase 2 — provider pattern).
- Internacionalização.
- Integração real de redes sociais / analytics.
- Link de "entrar" para o app a partir desta página.

## Componentes do magic MCP

Na implementação, buscar no magic MCP componentes-base para:
- Rede de partículas conectadas (connected/constellation particles).
- Campo de brasas/faíscas subindo (rising embers/sparks).

Adaptar ambos para: ler o accent do `useBrandCycle`, respeitar densidade responsiva e
`prefers-reduced-motion`, e expor cleanup adequado. Aurora e grid são CSS nativo (mais leves
e fáceis de tematizar) — não vêm do magic.

## Critérios de aceite

- [ ] `/` renderiza a página Em Breve para qualquer visitante (sem redirect por auth).
- [ ] `/app`, `/loja`, `/auth`, `/design-system` continuam acessíveis por URL direta.
- [ ] As 4 camadas de efeito aparecem empilhadas e animadas.
- [ ] Accent cicla entre as 3 submarcas com transição suave, afetando partículas, barra e botão.
- [ ] Barra de progresso, countdown ao vivo, captura de e-mail (toast) e contatos funcionam.
- [ ] `prefers-reduced-motion` desliga o movimento; mobile reduz densidade e remove brasas.
- [ ] `bun run build` (type-check) e `bun run lint` passam.
