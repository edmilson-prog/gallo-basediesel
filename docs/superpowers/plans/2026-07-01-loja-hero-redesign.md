# Hero enriquecido da loja (`/loja`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar partículas 3D, parallax e um carrossel de fundo ao hero da loja pública (`/loja`), mantendo o conteúdo atual (headline/CTAs) e sem tocar em dados/admin, além de corrigir o flash de tema (âmbar→verde) no boot.

**Architecture:** `StorefrontHero.tsx` vira um orquestrador de 4 camadas empilhadas (fundo → frente): partículas three.js lazy-loaded, carrossel de painéis ilustrados (crossfade CSS puro), overlay de gradiente, conteúdo textual com leve parallax. Toda a lógica de decisão (ligar/desligar efeitos, calcular offset de parallax) fica isolada em funções puras testáveis em `src/features/storefront/engine/heroMotion.ts`. Um pequeno ajuste no script anti-FOUC do `index.html` aplica `data-theme="parts"` antes do primeiro paint para rotas `/loja`.

**Tech Stack:** React 19 + TypeScript, three.js (já instalado, reaproveita o padrão de `MeshWaveBackground.tsx`), Tailwind CSS v4, Vitest.

## Global Constraints

- Sem dependência nova — não adicionar `embla-carousel-autoplay` nem `embla-carousel-fade`; o carrossel usa crossfade CSS puro + `setInterval`, sem `embla-carousel-react` (ver nota na Task 3).
- Comentários em inglês; qualquer texto visível ao usuário em português do Brasil com acentuação correta.
- TypeScript `strict: true`; evitar `any`; interfaces de domínio prefixadas com `I`.
- Arquivos em kebab-case; variáveis/funções em camelCase; componentes em PascalCase.
- Componentes consomem apenas tokens semânticos (`bg-primary`, `text-primary-foreground`, etc.) — nunca hex fixo em classes Tailwind. Exceção deliberada: a cor das partículas em `HeroParticles` precisa de um valor hex real para o three.js, resolvido em runtime via `getComputedStyle(...).getPropertyValue("--primary")`, nunca hardcoded.
- Threshold de viewport para desligar as partículas em telas pequenas: **480px** de largura.
- `maxOffsetPx` do parallax: **16px** (efeito sutil, não desloca layout perceptivelmente).
- Sem migration, sem Edge Function, sem mudança em `IStorefrontConfig` nem no admin (`StorefrontConfigPage.tsx`) — escopo 100% frontend.
- Gates: `bun run test` (Vitest) + `bun run build` (Vite). `bunx tsc --noEmit` tem baseline de ~315 erros pré-existentes — não é gate por si só; se rodar, avalie só os arquivos novos desta feature.
- Commits em Conventional Commits, em inglês, atômicos por task.
- Validação visual da UI é feita pelo usuário — não abrir browser/preview para testar (o dev server já está rodando em `http://localhost:5173`).

---

### Task 1: Funções puras de motion do hero (`heroMotion.ts`)

**Files:**
- Create: `src/features/storefront/engine/heroMotion.ts`
- Test: `src/features/storefront/engine/heroMotion.test.ts`

**Interfaces:**
- Consumes: nada (função pura, sem dependências do projeto além de tipos próprios).
- Produces:
  - `shouldEnableHeroEffects(ctx: IHeroEffectsContext): boolean`
  - `computeParallaxOffset(state: IParallaxState): IParallaxOffset`
  - `export interface IHeroEffectsContext { reducedMotion: boolean; hasWebGL: boolean; viewportWidth: number }`
  - `export interface IParallaxState { scrollY: number; normalizedMouseX: number; normalizedMouseY: number; maxOffsetPx: number }`
  - `export interface IParallaxOffset { x: number; y: number }`
  - Usados por: Task 2 (`useParallaxOffset.ts`) e Task 5 (`StorefrontHero.tsx`).

- [ ] **Step 1: Escrever os testes que falham**

Criar `src/features/storefront/engine/heroMotion.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { computeParallaxOffset, shouldEnableHeroEffects } from "./heroMotion";

describe("shouldEnableHeroEffects", () => {
  it("enables when motion is fine, WebGL is available and viewport is wide enough", () => {
    expect(
      shouldEnableHeroEffects({ reducedMotion: false, hasWebGL: true, viewportWidth: 1280 }),
    ).toBe(true);
  });

  it("disables when the user prefers reduced motion", () => {
    expect(
      shouldEnableHeroEffects({ reducedMotion: true, hasWebGL: true, viewportWidth: 1280 }),
    ).toBe(false);
  });

  it("disables when WebGL is unavailable", () => {
    expect(
      shouldEnableHeroEffects({ reducedMotion: false, hasWebGL: false, viewportWidth: 1280 }),
    ).toBe(false);
  });

  it("disables below the 480px viewport threshold", () => {
    expect(
      shouldEnableHeroEffects({ reducedMotion: false, hasWebGL: true, viewportWidth: 479 }),
    ).toBe(false);
  });

  it("enables exactly at the 480px viewport threshold", () => {
    expect(
      shouldEnableHeroEffects({ reducedMotion: false, hasWebGL: true, viewportWidth: 480 }),
    ).toBe(true);
  });
});

describe("computeParallaxOffset", () => {
  it("returns zero offset when scroll and mouse are both at rest", () => {
    expect(
      computeParallaxOffset({ scrollY: 0, normalizedMouseX: 0, normalizedMouseY: 0, maxOffsetPx: 16 }),
    ).toEqual({ x: 0, y: 0 });
  });

  it("drifts the y offset upward as the user scrolls down", () => {
    const offset = computeParallaxOffset({
      scrollY: 100,
      normalizedMouseX: 0,
      normalizedMouseY: 0,
      maxOffsetPx: 16,
    });
    expect(offset).toEqual({ x: 0, y: -5 });
  });

  it("clamps the scroll drift at maxOffsetPx for large scroll distances", () => {
    const offset = computeParallaxOffset({
      scrollY: 10_000,
      normalizedMouseX: 0,
      normalizedMouseY: 0,
      maxOffsetPx: 16,
    });
    expect(offset.y).toBe(-16);
  });

  it("moves x with the mouse, scaled by maxOffsetPx", () => {
    const offset = computeParallaxOffset({
      scrollY: 0,
      normalizedMouseX: 1,
      normalizedMouseY: 0,
      maxOffsetPx: 16,
    });
    expect(offset).toEqual({ x: 8, y: 0 });
  });

  it("combines scroll drift and mouse-y into the final y offset", () => {
    const offset = computeParallaxOffset({
      scrollY: 100,
      normalizedMouseX: -1,
      normalizedMouseY: 1,
      maxOffsetPx: 16,
    });
    expect(offset).toEqual({ x: -8, y: 3 });
  });
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `bunx vitest run src/features/storefront/engine/heroMotion.test.ts`
Expected: FAIL — `Cannot find module './heroMotion'` (o arquivo ainda não existe).

- [ ] **Step 3: Implementar `heroMotion.ts`**

Criar `src/features/storefront/engine/heroMotion.ts`:

```ts
/**
 * Pure motion/effect-gating logic for the storefront hero (no DOM access).
 * Consumed by StorefrontHero.tsx and useParallaxOffset.ts.
 */

export interface IHeroEffectsContext {
  reducedMotion: boolean;
  hasWebGL: boolean;
  viewportWidth: number;
}

const MIN_VIEWPORT_WIDTH_FOR_PARTICLES = 480;

/** Decides whether the 3D particle layer should mount. */
export function shouldEnableHeroEffects(ctx: IHeroEffectsContext): boolean {
  return !ctx.reducedMotion && ctx.hasWebGL && ctx.viewportWidth >= MIN_VIEWPORT_WIDTH_FOR_PARTICLES;
}

export interface IParallaxState {
  scrollY: number;
  /** -1 (left/top) to 1 (right/bottom), 0 = center. */
  normalizedMouseX: number;
  normalizedMouseY: number;
  maxOffsetPx: number;
}

export interface IParallaxOffset {
  x: number;
  y: number;
}

const SCROLL_DRIFT_FACTOR = 0.05;
const MOUSE_DRIFT_FACTOR = 0.5;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Combines scroll drift and mouse-follow into a small clamped translate offset. */
export function computeParallaxOffset(state: IParallaxState): IParallaxOffset {
  const { scrollY, normalizedMouseX, normalizedMouseY, maxOffsetPx } = state;
  const scrollDrift = clamp(-scrollY * SCROLL_DRIFT_FACTOR, -maxOffsetPx, maxOffsetPx);
  const mouseX = clamp(normalizedMouseX * maxOffsetPx * MOUSE_DRIFT_FACTOR, -maxOffsetPx, maxOffsetPx);
  const mouseY = clamp(normalizedMouseY * maxOffsetPx * MOUSE_DRIFT_FACTOR, -maxOffsetPx, maxOffsetPx);
  return {
    x: mouseX,
    y: clamp(scrollDrift + mouseY, -maxOffsetPx, maxOffsetPx),
  };
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `bunx vitest run src/features/storefront/engine/heroMotion.test.ts`
Expected: PASS — 10 testes verdes.

- [ ] **Step 5: Commit**

```bash
git add src/features/storefront/engine/heroMotion.ts src/features/storefront/engine/heroMotion.test.ts
git commit -m "feat(storefront): add pure hero motion/effect-gating logic"
```

---

### Task 2: Hook de parallax (`useParallaxOffset`)

**Files:**
- Create: `src/features/storefront/hooks/useParallaxOffset.ts`

**Interfaces:**
- Consumes: `computeParallaxOffset`, `IParallaxOffset` de `../engine/heroMotion` (Task 1).
- Produces: `useParallaxOffset(containerRef: RefObject<HTMLElement | null>, enabled: boolean): IParallaxOffset` — usado por Task 5 (`StorefrontHero.tsx`).

Sem teste de unidade nesta task: é uma ponte fina para eventos de `scroll`/`mousemove` do DOM (jsdom não simula `getBoundingClientRect`/scroll real de forma útil aqui), no mesmo padrão de `brand-backgrounds/` (que também não tem testes de unidade para o código DOM-coupled — só a lógica pura é testada, já coberta na Task 1).

- [ ] **Step 1: Implementar o hook**

Criar `src/features/storefront/hooks/useParallaxOffset.ts`:

```ts
import { useEffect, useRef, useState, type RefObject } from "react";
import { computeParallaxOffset, type IParallaxOffset } from "../engine/heroMotion";

const MAX_OFFSET_PX = 16;
const ZERO_OFFSET: IParallaxOffset = { x: 0, y: 0 };

/**
 * Bridges scroll/mousemove events to `computeParallaxOffset`. Returns
 * `{ x: 0, y: 0 }` (and stays inert) while `enabled` is false — callers pass
 * the same gate used for the particle layer (`shouldEnableHeroEffects`).
 */
export function useParallaxOffset(
  containerRef: RefObject<HTMLElement | null>,
  enabled: boolean,
): IParallaxOffset {
  const [offset, setOffset] = useState<IParallaxOffset>(ZERO_OFFSET);
  const frameRef = useRef<number | null>(null);
  const stateRef = useRef({ scrollY: 0, normalizedMouseX: 0, normalizedMouseY: 0 });

  useEffect(() => {
    if (!enabled) {
      setOffset(ZERO_OFFSET);
      return;
    }

    const scheduleUpdate = () => {
      if (frameRef.current !== null) return;
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = null;
        setOffset(computeParallaxOffset({ ...stateRef.current, maxOffsetPx: MAX_OFFSET_PX }));
      });
    };

    const handleScroll = () => {
      stateRef.current.scrollY = window.scrollY;
      scheduleUpdate();
    };

    const handleMouseMove = (event: MouseEvent) => {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      stateRef.current.normalizedMouseX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      stateRef.current.normalizedMouseY = ((event.clientY - rect.top) / rect.height) * 2 - 1;
      scheduleUpdate();
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("mousemove", handleMouseMove);

    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("mousemove", handleMouseMove);
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, [enabled, containerRef]);

  return offset;
}
```

- [ ] **Step 2: Verificar que o projeto continua compilando**

Run: `bun run build`
Expected: build Vite conclui sem erros (o hook ainda não é importado por ninguém, mas precisa compilar isoladamente sem erro de tipo).

- [ ] **Step 3: Commit**

```bash
git add src/features/storefront/hooks/useParallaxOffset.ts
git commit -m "feat(storefront): add useParallaxOffset hook for the hero"
```

---

### Task 3: Carrossel de fundo ilustrado (`HeroImageCarousel`)

**Files:**
- Create: `src/features/storefront/components/hero/HeroImageCarousel.tsx`

**Interfaces:**
- Consumes: `cn` de `@/lib/utils`; `Icon` de `@/components/Icon`.
- Produces: `HeroImageCarousel({ paused }: IHeroImageCarouselProps)` onde `IHeroImageCarouselProps = { paused: boolean }` — usado por Task 5.

> **Nota de desvio da spec:** o design doc menciona `embla-carousel-react` para este componente, mas o comportamento pedido é **crossfade** (opacidade), e o comportamento padrão do Embla é slide/arrasto — um crossfade de verdade exigiria o plugin `embla-carousel-fade`, que não está instalado (e a spec explicitamente evita novas dependências, como já decidido para o autoplay). Este componente implementa o crossfade com painéis empilhados + CSS `transition-opacity` + `setInterval`, sem depender do Embla. Resultado visual idêntico ao pedido, sem lib nova.

Sem teste de unidade (componente decorativo, mesmo padrão de `brand-backgrounds/`).

- [ ] **Step 1: Implementar o componente**

Criar `src/features/storefront/components/hero/HeroImageCarousel.tsx`:

```tsx
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/Icon";

interface IHeroPanel {
  icon: string;
}

const HERO_PANELS: IHeroPanel[] = [
  { icon: "mdi:engine" },
  { icon: "mdi:truck-fast" },
  { icon: "mdi:cog-outline" },
  { icon: "mdi:car-brake-alert" },
];

const ROTATE_INTERVAL_MS = 6000;

export interface IHeroImageCarouselProps {
  /** When true (reduced-motion or effects disabled), stays on the first panel. */
  paused: boolean;
}

/**
 * Decorative background carousel behind the hero gradient overlay — cycles
 * through large faint icon panels via opacity crossfade. See Task 3 note in
 * the implementation plan for why this isn't built on embla-carousel-react.
 */
export function HeroImageCarousel({ paused }: IHeroImageCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (paused) return;
    const id = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % HERO_PANELS.length);
    }, ROTATE_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [paused]);

  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden="true">
      {HERO_PANELS.map((panel, index) => (
        <div
          key={panel.icon}
          className={cn(
            "absolute inset-0 bg-gradient-to-br from-black/30 via-black/10 to-transparent opacity-0 transition-opacity duration-[1200ms] ease-linear",
            index === activeIndex && "opacity-100",
          )}
        >
          <Icon
            icon={panel.icon}
            size={480}
            className="absolute -right-20 top-1/2 -translate-y-1/2 text-white/10"
          />
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Verificar que o projeto continua compilando**

Run: `bun run build`
Expected: build conclui sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/features/storefront/components/hero/HeroImageCarousel.tsx
git commit -m "feat(storefront): add HeroImageCarousel crossfade background"
```

---

### Task 4: Camada de partículas 3D (`HeroParticles`)

**Files:**
- Create: `src/features/storefront/components/hero/HeroParticles.tsx`

**Interfaces:**
- Consumes: `three` (já instalado).
- Produces: `export default function HeroParticles({ color }: IHeroParticlesProps)` onde `IHeroParticlesProps = { color: string }` — consumido por Task 5 via `React.lazy(() => import("./hero/HeroParticles"))` (precisa ser `export default` para o `lazy()` funcionar).

Sem teste de unidade — canvas/WebGL, mesmo padrão de `MeshWaveBackground.tsx` (não testado no projeto).

- [ ] **Step 1: Implementar o componente**

Criar `src/features/storefront/components/hero/HeroParticles.tsx`:

```tsx
import { useEffect, useRef } from "react";
import * as THREE from "three";

export interface IHeroParticlesProps {
  /** Resolved `--primary` token value (hex string) at mount time. */
  color: string;
}

const GRID = { cols: 34, rows: 20, jitter: 0.35, dotRadius: 0.035, spacing: 0.62 };
const PARTICLE_OPACITY = 0.5;

/**
 * Decorative particle field behind the hero content (lazy-loaded). Mirrors
 * the lifecycle pattern of `brand-backgrounds/MeshWaveBackground.tsx`
 * (InstancedMesh grid, RAF animation loop, ResizeObserver, full cleanup on
 * unmount) but skips postprocessing (no EffectComposer/bloom) — this sits
 * behind readable text on every `/loja` visit, so it stays cheap. The parent
 * (StorefrontHero) only mounts this when `shouldEnableHeroEffects` is true,
 * so there's no reduced-motion/WebGL check duplicated here.
 */
export default function HeroParticles({ color }: IHeroParticlesProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera();

    const total = GRID.cols * GRID.rows;
    const geometry = new THREE.CircleGeometry(GRID.dotRadius, 8);
    const material = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color),
      transparent: true,
      opacity: PARTICLE_OPACITY,
    });
    const dots = new THREE.InstancedMesh(geometry, material, total);
    dots.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(dots);

    const basePos = new Float32Array(total * 2);
    const distArr = new Float32Array(total);
    const xOffset = (GRID.cols - 1) * GRID.spacing * 0.5;
    const yOffset = (GRID.rows - 1) * GRID.spacing * 0.5;
    const dummy = new THREE.Object3D();
    let idx = 0;
    for (let r = 0; r < GRID.rows; r++) {
      for (let c = 0; c < GRID.cols; c++, idx++) {
        let x = c * GRID.spacing - xOffset;
        let y = r * GRID.spacing - yOffset;
        x += (Math.random() - 0.5) * GRID.jitter;
        y += (Math.random() - 0.5) * GRID.jitter;
        basePos[idx * 2] = x;
        basePos[idx * 2 + 1] = y;
        distArr[idx] = Math.hypot(x, y);
        dummy.position.set(x, y, 0);
        dummy.updateMatrix();
        dots.setMatrixAt(idx, dummy.matrix);
      }
    }

    const clock = new THREE.Clock();
    const mat = new THREE.Matrix4();
    let frame = 0;

    const resize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      const aspect = w / h || 1;
      const worldHeight = 14;
      const worldWidth = worldHeight * aspect;
      camera.left = -worldWidth / 2;
      camera.right = worldWidth / 2;
      camera.top = worldHeight / 2;
      camera.bottom = -worldHeight / 2;
      camera.near = -100;
      camera.far = 100;
      camera.position.set(0, 0, 10);
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    const animate = () => {
      frame = requestAnimationFrame(animate);
      const t = clock.getElapsedTime();
      for (let i = 0; i < total; i++) {
        const x0 = basePos[i * 2] as number;
        const y0 = basePos[i * 2 + 1] as number;
        const dist = distArr[i] as number;
        const wave = 1 + 0.08 * Math.sin(t * 0.6 - dist * 0.4);
        mat.set(1, 0, 0, x0 * wave, 0, 1, 0, y0 * wave, 0, 0, 1, 0, 0, 0, 0, 1);
        dots.setMatrixAt(i, mat);
      }
      dots.instanceMatrix.needsUpdate = true;
      renderer.render(scene, camera);
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);
    frame = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) container.removeChild(renderer.domElement);
    };
  }, [color]);

  return <div ref={containerRef} className="absolute inset-0 h-full w-full" aria-hidden="true" />;
}
```

- [ ] **Step 2: Verificar que o projeto continua compilando**

Run: `bun run build`
Expected: build conclui sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/features/storefront/components/hero/HeroParticles.tsx
git commit -m "feat(storefront): add HeroParticles 3D background layer"
```

---

### Task 5: Recompor `StorefrontHero.tsx` com as 4 camadas

**Files:**
- Modify: `src/features/storefront/components/StorefrontHero.tsx` (reescrita completa — arquivo atual tem 89 linhas)

**Interfaces:**
- Consumes:
  - `shouldEnableHeroEffects` de `../engine/heroMotion` (Task 1)
  - `useParallaxOffset` de `../hooks/useParallaxOffset` (Task 2)
  - `HeroImageCarousel` de `./hero/HeroImageCarousel` (Task 3)
  - `HeroParticles` (default export) de `./hero/HeroParticles`, via `React.lazy` (Task 4)
- Produces: `StorefrontHero({ hero, onSearchFocus }: IStorefrontHeroProps)` — **assinatura inalterada**, consumido por `StorefrontHomePage.tsx` (não muda).

Comportamento novo:
- Quando `hero.backgroundImageUrl` **está** setado: mantém o comportamento atual exatamente (imagem de fundo + overlay escuro), sem partículas/carrossel — a foto escolhida pelo dono tem prioridade sobre os efeitos gerados.
- Quando `hero.backgroundImageUrl` **não** está setado: renderiza partículas (se `shouldEnableHeroEffects` permitir) + carrossel ilustrado + overlay de gradiente reduzido (deixa as camadas de trás aparecerem).
- Conteúdo textual ganha um `transform: translate3d(x, y, 0)` vindo de `useParallaxOffset`.

- [ ] **Step 1: Reescrever o arquivo**

Substituir o conteúdo de `src/features/storefront/components/StorefrontHero.tsx` por:

```tsx
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { IStorefrontConfig } from "@/shared/types";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { STOREFRONT_STRINGS as S } from "../i18n/pt-BR";
import { HeroImageCarousel } from "./hero/HeroImageCarousel";
import { shouldEnableHeroEffects } from "../engine/heroMotion";
import { useParallaxOffset } from "../hooks/useParallaxOffset";

const HeroParticles = lazy(() => import("./hero/HeroParticles"));

/** Fallback color while the real `--primary` token hasn't been read yet (gallo-parts-medium). */
const DEFAULT_PARTICLE_COLOR = "#1e7a3c";

function detectWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return !!(canvas.getContext("webgl") || canvas.getContext("experimental-webgl"));
  } catch {
    return false;
  }
}

export interface IStorefrontHeroProps {
  hero: IStorefrontConfig["hero"];
  /** Focuses the header search input — supplied by the page that owns the search ref. */
  onSearchFocus?: () => void;
}

/**
 * Top hero of the public home (PRD-060 RF-007). Headline + subheadline + 2 CTAs
 * plus up to 3 trust indicators. When `backgroundImageUrl` is unset, renders a
 * layered look (particles + illustrated carousel + gradient) coherent with the
 * PARTS theme; a custom image takes priority over the generated effects.
 */
export function StorefrontHero({ hero, onSearchFocus }: IStorefrontHeroProps) {
  const navigate = useNavigate();
  const sectionRef = useRef<HTMLElement | null>(null);
  const [effectsEnabled, setEffectsEnabled] = useState(false);
  const [particleColor, setParticleColor] = useState(DEFAULT_PARTICLE_COLOR);

  const hasCustomBackground = Boolean(hero.backgroundImageUrl);

  useEffect(() => {
    if (hasCustomBackground) {
      setEffectsEnabled(false);
      return;
    }
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setEffectsEnabled(
      shouldEnableHeroEffects({
        reducedMotion,
        hasWebGL: detectWebGL(),
        viewportWidth: window.innerWidth,
      }),
    );
    const computedColor = getComputedStyle(document.documentElement).getPropertyValue("--primary").trim();
    if (computedColor) setParticleColor(computedColor);
  }, [hasCustomBackground]);

  const parallax = useParallaxOffset(sectionRef, effectsEnabled);

  return (
    <section
      ref={sectionRef}
      className="relative isolate overflow-hidden text-primary-foreground"
      aria-label="Apresentação da GALLO PARTS"
    >
      {hasCustomBackground ? (
        <div
          className="absolute inset-0"
          aria-hidden="true"
          style={{
            backgroundImage: `linear-gradient(120deg, rgba(0,0,0,0.55), rgba(0,0,0,0.2)), url("${hero.backgroundImageUrl}")`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
      ) : (
        <>
          {effectsEnabled && (
            <Suspense fallback={null}>
              <HeroParticles color={particleColor} />
            </Suspense>
          )}
          <HeroImageCarousel paused={!effectsEnabled} />
          <div
            className="absolute inset-0 bg-gradient-to-br from-primary/90 via-primary/80 to-primary/65"
            aria-hidden="true"
          />
        </>
      )}

      {/* Decorative iconography */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-20">
        <Icon icon="mdi:engine" size={420} className="absolute -right-16 -top-10 text-white/30" />
        <Icon
          icon="mdi:car-brake-alert"
          size={220}
          className="absolute -bottom-8 left-1/3 text-white/20"
        />
      </div>

      <div
        className="relative mx-auto flex max-w-7xl flex-col gap-6 px-4 py-16 sm:py-20 lg:flex-row lg:items-center lg:gap-12 lg:py-24"
        style={{ transform: `translate3d(${parallax.x}px, ${parallax.y}px, 0)` }}
      >
        <div className="max-w-2xl space-y-6">
          <p className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/10 px-3 py-1 text-xs font-medium uppercase tracking-wider text-white/90 backdrop-blur">
            <Icon icon="mdi:truck-fast" size={14} aria-hidden />
            GALLO BASE DIESEL · PARTS
          </p>
          <h1 className="font-display text-3xl font-bold leading-tight tracking-tight sm:text-4xl lg:text-5xl">
            {hero.headline}
          </h1>
          <p className="text-base text-white/90 sm:text-lg">{hero.subheadline}</p>
          <div className="flex flex-wrap gap-3">
            <Button
              size="lg"
              variant="secondary"
              className="bg-white text-primary hover:bg-white/90"
              onClick={() => {
                if (onSearchFocus) onSearchFocus();
                else void navigate({ to: "/loja/busca" });
              }}
            >
              <Icon icon="mdi:magnify" size={18} className="mr-2" />
              {S.heroPrimaryCta}
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="border-white/40 bg-transparent text-white hover:bg-white/10 hover:text-white"
              onClick={() => void navigate({ to: "/loja/busca" })}
            >
              <Icon icon="mdi:view-grid-outline" size={18} className="mr-2" />
              {S.heroSecondaryCta}
            </Button>
          </div>
          <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/90">
            {hero.indicators.slice(0, 3).map((indicator) => (
              <li key={indicator} className="flex items-center gap-1.5">
                <Icon icon="mdi:check-circle" size={16} className="text-emerald-200" aria-hidden />
                {indicator}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Rodar a suíte de testes completa**

Run: `bun run test`
Expected: PASS — nenhum teste existente quebra (`StorefrontHero` não tem teste próprio; os testes de `heroMotion.ts` da Task 1 continuam verdes).

- [ ] **Step 3: Rodar o build**

Run: `bun run build`
Expected: build Vite conclui sem erros. Preste atenção a qualquer warning de import não usado (ex.: se algum import antigo ficou órfão na reescrita).

- [ ] **Step 4: Commit**

```bash
git add src/features/storefront/components/StorefrontHero.tsx
git commit -m "feat(storefront): layer particles, carousel and parallax into the hero"
```

---

### Task 6: Corrigir o FOUC de tema para `/loja` no boot

**Files:**
- Modify: `index.html:50-72` (script anti-FOUC inline)

**Interfaces:**
- Consumes: nada (script standalone, roda antes de qualquer bundle React).
- Produces: nada consumido por outro código — efeito colateral no `<html data-theme>` do primeiro paint.

- [ ] **Step 1: Editar o script anti-FOUC**

Em `index.html`, dentro do `<script>` inline (linhas 50-72), adicionar uma linha logo após a resolução de `theme` a partir do `localStorage`, forçando `"parts"` quando o path é `/loja`:

Trecho atual (linhas 52-58):
```js
        try {
          var html = document.documentElement;
          var theme = localStorage.getItem("gallo-theme");
          if (!["diesel", "parts", "service", "industrial"].includes(theme)) theme = "diesel";
          var mode = localStorage.getItem("gallo-mode");
```

Substituir por:
```js
        try {
          var html = document.documentElement;
          var theme = localStorage.getItem("gallo-theme");
          if (!["diesel", "parts", "service", "industrial"].includes(theme)) theme = "diesel";
          if (window.location.pathname.indexOf("/loja") === 0) theme = "parts";
          var mode = localStorage.getItem("gallo-mode");
```

(Resto do script permanece idêntico — só essa linha nova entra entre a resolução do `theme` salvo e a resolução do `mode`.)

- [ ] **Step 2: Verificar o arquivo final**

Ler `index.html:50-73` e confirmar que o script ficou assim (bloco completo, para conferência):

```js
    <script>
      // Anti-FOUC: aplica data-theme/data-mode + classe .dark antes do primeiro paint.
      (function () {
        try {
          var html = document.documentElement;
          var theme = localStorage.getItem("gallo-theme");
          if (!["diesel", "parts", "service", "industrial"].includes(theme)) theme = "diesel";
          if (window.location.pathname.indexOf("/loja") === 0) theme = "parts";
          var mode = localStorage.getItem("gallo-mode");
          if (!["light", "dark", "auto"].includes(mode)) mode = "auto";
          var resolved = mode;
          if (mode === "auto") {
            resolved = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
          }
          html.setAttribute("data-theme", theme);
          html.setAttribute("data-mode", resolved);
          if (resolved === "dark") html.classList.add("dark");
        } catch (_e) {
          document.documentElement.setAttribute("data-theme", "diesel");
          document.documentElement.setAttribute("data-mode", "dark");
          document.documentElement.classList.add("dark");
        }
      })();
    </script>
```

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "fix(storefront): force parts theme before first paint on /loja"
```

---

### Task 7: Verificação final

**Files:** nenhum (task só de verificação — sem alterações de código).

- [ ] **Step 1: Rodar a suíte de testes completa**

Run: `bun run test`
Expected: PASS — todos os testes verdes, incluindo os 10 novos de `heroMotion.test.ts`.

- [ ] **Step 2: Rodar o build de produção**

Run: `bun run build`
Expected: build Vite conclui sem erros nem warnings novos.

- [ ] **Step 3: Checar o delta de `tsc` nos arquivos novos**

Run: `git diff --name-status main...HEAD --diff-filter=A`
Depois, para cada arquivo novo (`heroMotion.ts`, `useParallaxOffset.ts`, `HeroImageCarousel.tsx`, `HeroParticles.tsx`): confirmar que nenhum deles aparece nos erros ao rodar `bunx tsc --noEmit` (baseline de ~315 erros pré-existentes é aceitável; **erro novo nesses 4 arquivos não é**).

- [ ] **Step 4: Pedir validação visual ao usuário**

Não abrir browser/preview para testar — o dev server já está ativo em `http://localhost:5173`. Pedir ao usuário para:
1. Acessar `/loja` com hard refresh e confirmar que não há mais o flash âmbar→verde no hero.
2. Observar as partículas, o carrossel de fundo (cross-fade a cada ~6s) e o leve parallax ao rolar/mover o mouse sobre o hero.
3. Testar com `prefers-reduced-motion` ativado no SO/navegador e confirmar que partículas/parallax/autoplay do carrossel ficam desligados.
