# Página "Em Breve" (Coming Soon) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Servir na raiz `/` uma página pública "em breve" com fundo animado multicamada (aurora + grid + rede de partículas + brasas) e identidade multimarca animada, contendo barra de progresso, countdown, captura de e-mail (mock) e contatos.

**Architecture:** Feature isolada em `src/features/coming-soon/`. Quatro camadas de efeito empilhadas por `z-index` (Abordagem B): duas em CSS (aurora, grid) e duas em `<canvas>` (rede, brasas). Um hook (`useBrandCycle`) anima um CSS custom property `--coming-accent` (RGB) escopado ao container e expõe um ref RGB para os canvases lerem por frame. A rota `/` deixa de redirecionar por auth e passa a renderizar `<ComingSoonPage />` em tela cheia, fora do app shell. A página monta seu próprio `<Toaster>` do sonner (o app não monta um global).

**Tech Stack:** React 19, TypeScript strict, TanStack Router (file-based), Tailwind v4, CSS nativo (keyframes/canvas), react-hook-form + zod, sonner.

**Observações de processo:**

- O projeto **não tem suite de testes** (CLAUDE.md). A verificação de cada task é `bun run build` (type-check via `tsc --noEmit`) + `bun run lint`. A verificação visual final usa o dev server (`bun run dev`, já roda em :5179) — o usuário valida a UI manualmente.
- Convenção de arquivos segue a feature real `src/features/auth/`: componentes em **PascalCase**, hooks `useXxx`, demais lowercase. (Diverge do kebab-case do CLAUDE.md global em favor da consistência com o código existente.)
- Componentes de partículas (rede e brasas): o spec previa origem no **magic MCP**. Este plano traz uma implementação canvas vanilla **completa e validada no protótipo de brainstorming** como implementação canônica (determinística e sem dependência externa). Opcionalmente, o magic MCP pode ser consultado para refinar o visual depois — mas não é necessário para concluir o plano.

---

## File Structure

```
src/features/coming-soon/
├── config.ts               # launchDate, progressPercent, contacts
├── coming-soon.css         # estilos custom: layers, keyframes, accent
├── useBrandCycle.ts        # hook do ciclo multimarca (CSS var + ref RGB)
├── AuroraLayer.tsx         # camada 1 (CSS)
├── GridLayer.tsx           # camada 2 (CSS)
├── ParticleNetwork.tsx     # camada 3 (canvas)
├── EmberField.tsx          # camada 4 (canvas)
├── Countdown.tsx           # contagem regressiva
├── EmailCapture.tsx        # form RHF+zod, submit mock → toast
└── ComingSoonPage.tsx      # composição + <Toaster>
```

Modificado: `src/routes/index.tsx` (remove redirect, renderiza a página).

---

## Task 1: Config e hook multimarca

**Files:**

- Create: `src/features/coming-soon/config.ts`
- Create: `src/features/coming-soon/useBrandCycle.ts`

- [ ] **Step 1: Criar `config.ts`**

```ts
// src/features/coming-soon/config.ts

/** Valores configuráveis da página "Em Breve". Placeholders — ajustar quando houver dados reais. */
export const COMING_SOON = {
  /** Data-alvo do countdown (ISO 8601 com offset). */
  launchDate: "2026-07-15T12:00:00-03:00",
  /** Percentual exibido na barra de progresso (0–100). */
  progressPercent: 75,
  contacts: {
    whatsapp: "https://wa.me/5500000000000",
    instagram: "https://instagram.com/gallobasediesel",
    email: "contato@gallobasediesel.com.br",
    phone: "(55) 0000-0000",
  },
} as const;
```

- [ ] **Step 2: Criar `useBrandCycle.ts`**

```ts
// src/features/coming-soon/useBrandCycle.ts
import { useEffect, useRef, type RefObject } from "react";

export type Rgb = [number, number, number];

export interface IBrand {
  name: string;
  rgb: Rgb;
}

/** Submarcas GALLO (Parts verde, Service vermelho, Industrial amarelo). */
export const BRANDS: IBrand[] = [
  { name: "Parts", rgb: [30, 122, 60] },
  { name: "Service", rgb: [200, 38, 44] },
  { name: "Industrial", rgb: [199, 156, 44] },
];

const CYCLE_MS = 6000;
const LERP = 0.04;

/**
 * Anima o accent multimarca. Escreve `--coming-accent` (triplo "r, g, b") no
 * elemento alvo e devolve um ref com o RGB atual (lido pelos canvases por frame).
 * Respeita prefers-reduced-motion: aplica a 1ª marca fixa, sem ciclo nem rAF.
 */
export function useBrandCycle(targetRef: RefObject<HTMLElement | null>): RefObject<Rgb> {
  const rgbRef = useRef<Rgb>([...BRANDS[0].rgb]);

  useEffect(() => {
    const el = targetRef.current;
    if (!el) return;

    const apply = (rgb: Rgb) => {
      const r = Math.round(rgb[0]);
      const g = Math.round(rgb[1]);
      const b = Math.round(rgb[2]);
      el.style.setProperty("--coming-accent", `${r}, ${g}, ${b}`);
      rgbRef.current = [r, g, b];
    };

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      apply([...BRANDS[0].rgb]);
      return;
    }

    let idx = 0;
    const cur: Rgb = [...BRANDS[0].rgb];
    let target: Rgb = [...BRANDS[0].rgb];
    let raf = 0;

    const interval = window.setInterval(() => {
      idx = (idx + 1) % BRANDS.length;
      target = [...BRANDS[idx].rgb];
    }, CYCLE_MS);

    const frame = () => {
      cur[0] += (target[0] - cur[0]) * LERP;
      cur[1] += (target[1] - cur[1]) * LERP;
      cur[2] += (target[2] - cur[2]) * LERP;
      apply(cur);
      raf = requestAnimationFrame(frame);
    };
    frame();

    return () => {
      cancelAnimationFrame(raf);
      window.clearInterval(interval);
    };
  }, [targetRef]);

  return rgbRef;
}
```

- [ ] **Step 3: Verificar build e lint**

Run: `bun run build && bun run lint`
Expected: sem erros (os arquivos ainda não são importados, mas devem compilar).

- [ ] **Step 4: Commit**

```bash
git add src/features/coming-soon/config.ts src/features/coming-soon/useBrandCycle.ts
git commit -m "feat(coming-soon): add config and multi-brand accent cycle hook"
```

---

## Task 2: CSS da feature (layers, keyframes, accent)

**Files:**

- Create: `src/features/coming-soon/coming-soon.css`

- [ ] **Step 1: Criar `coming-soon.css`**

```css
/* src/features/coming-soon/coming-soon.css */

.cs-root {
  --coming-accent: 30, 122, 60; /* fallback; sobrescrito por useBrandCycle */
  --cs-bg: #08090c;
  --cs-gold: 201, 162, 74;
  position: fixed;
  inset: 0;
  height: 100dvh;
  width: 100%;
  overflow: hidden;
  background: var(--cs-bg);
  color: #f4f4f5;
  font-family: var(--font-sans, -apple-system, "Segoe UI", Roboto, sans-serif);
}

/* ---------- camada 1: aurora ---------- */
.cs-aurora {
  position: absolute;
  inset: -20%;
  z-index: 1;
  filter: blur(70px);
  opacity: 0.55;
  pointer-events: none;
}
.cs-aurora .blob {
  position: absolute;
  border-radius: 50%;
  width: 50vw;
  height: 50vw;
  mix-blend-mode: screen;
  background: radial-gradient(circle at center, rgba(var(--coming-accent), 0.9), transparent 70%);
}
.cs-aurora .b1 {
  top: -10%;
  left: -5%;
  animation: cs-drift1 18s ease-in-out infinite;
}
.cs-aurora .b2 {
  bottom: -15%;
  right: -5%;
  animation: cs-drift2 22s ease-in-out infinite;
  background: radial-gradient(circle at center, rgba(var(--coming-accent), 0.7), transparent 70%);
}
.cs-aurora .b3 {
  top: 30%;
  left: 35%;
  width: 38vw;
  height: 38vw;
  animation: cs-drift3 26s ease-in-out infinite;
  background: radial-gradient(circle at center, rgba(var(--cs-gold), 0.5), transparent 70%);
}
@keyframes cs-drift1 {
  0%,
  100% {
    transform: translate(0, 0) scale(1);
  }
  50% {
    transform: translate(12vw, 8vh) scale(1.2);
  }
}
@keyframes cs-drift2 {
  0%,
  100% {
    transform: translate(0, 0) scale(1.1);
  }
  50% {
    transform: translate(-10vw, -6vh) scale(0.9);
  }
}
@keyframes cs-drift3 {
  0%,
  100% {
    transform: translate(0, 0);
  }
  50% {
    transform: translate(-8vw, 10vh);
  }
}

/* ---------- camada 2: grid técnico ---------- */
.cs-grid {
  position: absolute;
  inset: -50px;
  z-index: 2;
  pointer-events: none;
  background-image:
    linear-gradient(rgba(var(--coming-accent), 0.14) 1px, transparent 1px),
    linear-gradient(90deg, rgba(var(--coming-accent), 0.14) 1px, transparent 1px);
  background-size: 46px 46px;
  -webkit-mask-image: radial-gradient(ellipse 75% 65% at 50% 45%, #000 30%, transparent 80%);
  mask-image: radial-gradient(ellipse 75% 65% at 50% 45%, #000 30%, transparent 80%);
  animation: cs-gridfloat 20s linear infinite;
}
@keyframes cs-gridfloat {
  from {
    background-position:
      0 0,
      0 0;
  }
  to {
    background-position:
      46px 46px,
      46px 46px;
  }
}

/* ---------- camadas 3 e 4: canvases ---------- */
.cs-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
.cs-net {
  z-index: 3;
}
.cs-embers {
  z-index: 4;
}

/* ---------- conteúdo ---------- */
.cs-content {
  position: relative;
  z-index: 5;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 22px;
  padding: 24px;
}
.cs-logo {
  height: 44px;
  width: auto;
  filter: drop-shadow(0 0 20px rgba(var(--coming-accent), 0.5));
  transition: filter 0.6s;
}
.cs-badge {
  font-size: 12px;
  letter-spacing: 0.28em;
  text-transform: uppercase;
  color: rgb(var(--coming-accent));
  border: 1px solid rgba(var(--coming-accent), 0.4);
  padding: 7px 16px;
  border-radius: 999px;
  transition:
    color 0.6s,
    border-color 0.6s;
}
.cs-headline {
  font-size: clamp(36px, 7vw, 80px);
  font-weight: 800;
  letter-spacing: -0.03em;
  line-height: 0.98;
}
.cs-headline span {
  background: linear-gradient(90deg, rgb(var(--coming-accent)), #f4f4f5);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  transition: all 0.6s;
}
.cs-sub {
  font-size: clamp(15px, 2.4vw, 19px);
  color: #a1a1aa;
  max-width: 540px;
}

.cs-progress {
  width: min(420px, 80vw);
}
.cs-progress-meta {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: #71717a;
  margin-bottom: 7px;
  letter-spacing: 0.05em;
}
.cs-progress-track {
  height: 8px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 999px;
  overflow: hidden;
}
.cs-progress-fill {
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, rgba(var(--coming-accent), 0.6), rgb(var(--coming-accent)));
  box-shadow: 0 0 16px rgba(var(--coming-accent), 0.7);
  transition:
    width 1.6s cubic-bezier(0.2, 0.8, 0.2, 1),
    background 0.6s,
    box-shadow 0.6s;
}

.cs-countdown {
  display: flex;
  gap: 14px;
}
.cs-cd-cell {
  min-width: 64px;
  padding: 12px 10px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(6px);
}
.cs-cd-num {
  font-size: 28px;
  font-weight: 700;
  color: rgb(var(--coming-accent));
  transition: color 0.6s;
  font-variant-numeric: tabular-nums;
}
.cs-cd-lbl {
  font-size: 10px;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: #71717a;
  margin-top: 2px;
}

.cs-form {
  display: flex;
  gap: 8px;
  width: min(440px, 88vw);
}
.cs-form input {
  flex: 1;
  padding: 13px 16px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: #f4f4f5;
  font-size: 15px;
  outline: none;
}
.cs-form input:focus-visible {
  border-color: rgb(var(--coming-accent));
}
.cs-form button {
  padding: 13px 22px;
  border-radius: 10px;
  border: none;
  cursor: pointer;
  background: rgb(var(--coming-accent));
  color: #08090c;
  font-weight: 700;
  font-size: 15px;
  transition:
    background 0.6s,
    transform 0.15s;
}
.cs-form button:hover {
  transform: translateY(-1px);
}
.cs-form-error {
  color: #f87171;
  font-size: 12px;
  margin-top: 6px;
  min-height: 16px;
}

.cs-social {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 18px;
}
.cs-social a {
  color: #a1a1aa;
  text-decoration: none;
  font-size: 13px;
  transition: color 0.25s;
}
.cs-social a:hover {
  color: rgb(var(--coming-accent));
}

.cs-footer {
  position: absolute;
  bottom: 16px;
  left: 0;
  right: 0;
  z-index: 5;
  text-align: center;
  font-size: 11px;
  color: #52525b;
}

@media (prefers-reduced-motion: reduce) {
  .cs-aurora .b1,
  .cs-aurora .b2,
  .cs-aurora .b3,
  .cs-grid {
    animation: none;
  }
}
```

- [ ] **Step 2: Verificar build e lint**

Run: `bun run build && bun run lint`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/features/coming-soon/coming-soon.css
git commit -m "feat(coming-soon): add feature stylesheet with layers and keyframes"
```

---

## Task 3: Camadas CSS (Aurora e Grid)

**Files:**

- Create: `src/features/coming-soon/AuroraLayer.tsx`
- Create: `src/features/coming-soon/GridLayer.tsx`

- [ ] **Step 1: Criar `AuroraLayer.tsx`**

```tsx
// src/features/coming-soon/AuroraLayer.tsx

/** Camada 1 — blobs de gradiente animados. Decorativa. */
export function AuroraLayer() {
  return (
    <div className="cs-aurora" aria-hidden="true">
      <div className="blob b1" />
      <div className="blob b2" />
      <div className="blob b3" />
    </div>
  );
}
```

- [ ] **Step 2: Criar `GridLayer.tsx`**

```tsx
// src/features/coming-soon/GridLayer.tsx

/** Camada 2 — malha blueprint com flutuação. Decorativa. */
export function GridLayer() {
  return <div className="cs-grid" aria-hidden="true" />;
}
```

- [ ] **Step 3: Verificar build e lint**

Run: `bun run build && bun run lint`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/features/coming-soon/AuroraLayer.tsx src/features/coming-soon/GridLayer.tsx
git commit -m "feat(coming-soon): add aurora and grid background layers"
```

---

## Task 4: Rede de partículas (canvas)

**Files:**

- Create: `src/features/coming-soon/ParticleNetwork.tsx`

- [ ] **Step 1: Criar `ParticleNetwork.tsx`**

```tsx
// src/features/coming-soon/ParticleNetwork.tsx
import { useEffect, useRef, type RefObject } from "react";
import type { Rgb } from "./useBrandCycle";

interface IParticleNetworkProps {
  /** RGB atual do accent (vem de useBrandCycle). */
  rgbRef: RefObject<Rgb>;
}

interface INode {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

const LINK_DIST = 130;

/** Camada 3 — rede de partículas conectadas, com repulsão ao mouse. Decorativa. */
export function ParticleNetwork({ rgbRef }: IParticleNetworkProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let nodes: INode[] = [];
    const mouse = { x: -9999, y: -9999 };

    const initNodes = () => {
      const count = width < 700 ? 38 : 80;
      nodes = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
      }));
    };

    const fit = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      initNodes();
    };

    fit();

    let raf = 0;
    let running = true;

    const draw = () => {
      const [r, g, b] = rgbRef.current;
      ctx.clearRect(0, 0, width, height);

      for (const n of nodes) {
        n.x += n.vx;
        n.y += n.vy;
        if (n.x < 0 || n.x > width) n.vx *= -1;
        if (n.y < 0 || n.y > height) n.vy *= -1;
        const dx = n.x - mouse.x;
        const dy = n.y - mouse.y;
        const d = Math.hypot(dx, dy);
        if (d < LINK_DIST && d > 0) {
          n.x += (dx / d) * 1.4;
          n.y += (dy / d) * 1.4;
        }
      }

      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x;
          const dy = nodes[i].y - nodes[j].y;
          const dist = Math.hypot(dx, dy);
          if (dist < LINK_DIST) {
            ctx.strokeStyle = `rgba(${r},${g},${b},${(1 - dist / LINK_DIST) * 0.35})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(nodes[i].x, nodes[i].y);
            ctx.lineTo(nodes[j].x, nodes[j].y);
            ctx.stroke();
          }
        }
      }

      ctx.fillStyle = `rgba(${r},${g},${b},0.85)`;
      for (const n of nodes) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, 2, 0, Math.PI * 2);
        ctx.fill();
      }

      if (running) raf = requestAnimationFrame(draw);
    };
    draw();

    const onMove = (e: MouseEvent) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
    };
    const onVisibility = () => {
      if (document.hidden) {
        running = false;
        cancelAnimationFrame(raf);
      } else if (!running) {
        running = true;
        draw();
      }
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("resize", fit);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("resize", fit);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [rgbRef]);

  return <canvas ref={canvasRef} className="cs-canvas cs-net" aria-hidden="true" />;
}
```

- [ ] **Step 2: Verificar build e lint**

Run: `bun run build && bun run lint`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/features/coming-soon/ParticleNetwork.tsx
git commit -m "feat(coming-soon): add connected particle network canvas"
```

---

## Task 5: Brasas / faíscas (canvas)

**Files:**

- Create: `src/features/coming-soon/EmberField.tsx`

- [ ] **Step 1: Criar `EmberField.tsx`**

```tsx
// src/features/coming-soon/EmberField.tsx
import { useEffect, useRef, type RefObject } from "react";
import type { Rgb } from "./useBrandCycle";

interface IEmberFieldProps {
  rgbRef: RefObject<Rgb>;
}

interface IEmber {
  x: number;
  y: number;
  r: number;
  vy: number;
  drift: number;
  life: number;
  max: number;
}

/** Camada 4 — brasas subindo com glow. Desativada em mobile e reduced-motion. Decorativa. */
export function EmberField({ rgbRef }: IEmberFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (window.innerWidth < 700) return; // mobile: sem brasas

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let embers: IEmber[] = [];

    const fit = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    fit();

    const spawn = (): IEmber => ({
      x: Math.random() * width,
      y: height + 10,
      r: Math.random() * 2.2 + 0.6,
      vy: -(Math.random() * 0.9 + 0.4),
      drift: (Math.random() - 0.5) * 0.4,
      life: 0,
      max: Math.random() * 220 + 120,
    });

    let raf = 0;
    let running = true;

    const draw = () => {
      const [r, g, b] = rgbRef.current;
      ctx.clearRect(0, 0, width, height);

      if (embers.length < 90 && Math.random() < 0.6) embers.push(spawn());
      embers = embers.filter((e) => e.life < e.max && e.y > -20);

      for (const e of embers) {
        e.life++;
        e.y += e.vy;
        e.x += e.drift + Math.sin(e.life / 20) * 0.3;
        const a = (1 - e.life / e.max) * 0.9;
        ctx.fillStyle = `rgba(${r},${g},${b},${a})`;
        ctx.shadowBlur = 8;
        ctx.shadowColor = `rgba(${r},${g},${b},${a})`;
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0;

      if (running) raf = requestAnimationFrame(draw);
    };
    draw();

    const onVisibility = () => {
      if (document.hidden) {
        running = false;
        cancelAnimationFrame(raf);
      } else if (!running) {
        running = true;
        draw();
      }
    };
    window.addEventListener("resize", fit);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", fit);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [rgbRef]);

  return <canvas ref={canvasRef} className="cs-canvas cs-embers" aria-hidden="true" />;
}
```

- [ ] **Step 2: Verificar build e lint**

Run: `bun run build && bun run lint`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/features/coming-soon/EmberField.tsx
git commit -m "feat(coming-soon): add rising embers canvas"
```

---

## Task 6: Countdown

**Files:**

- Create: `src/features/coming-soon/Countdown.tsx`

- [ ] **Step 1: Criar `Countdown.tsx`**

```tsx
// src/features/coming-soon/Countdown.tsx
import { useEffect, useState } from "react";

interface ICountdownProps {
  /** Data-alvo em ISO 8601. */
  target: string;
}

interface ITimeLeft {
  d: number;
  h: number;
  m: number;
  s: number;
}

function computeLeft(target: number): ITimeLeft {
  let diff = Math.max(0, target - Date.now());
  const d = Math.floor(diff / 86_400_000);
  diff -= d * 86_400_000;
  const h = Math.floor(diff / 3_600_000);
  diff -= h * 3_600_000;
  const m = Math.floor(diff / 60_000);
  diff -= m * 60_000;
  const s = Math.floor(diff / 1000);
  return { d, h, m, s };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Contagem regressiva ao vivo até a data de lançamento. */
export function Countdown({ target }: ICountdownProps) {
  const targetMs = new Date(target).getTime();
  const [left, setLeft] = useState<ITimeLeft>(() => computeLeft(targetMs));

  useEffect(() => {
    const id = window.setInterval(() => setLeft(computeLeft(targetMs)), 1000);
    return () => window.clearInterval(id);
  }, [targetMs]);

  const cells: Array<[number, string]> = [
    [left.d, "dias"],
    [left.h, "horas"],
    [left.m, "min"],
    [left.s, "seg"],
  ];

  return (
    <div className="cs-countdown" aria-live="polite" aria-label="Tempo restante para o lançamento">
      {cells.map(([value, label]) => (
        <div key={label} className="cs-cd-cell">
          <div className="cs-cd-num">{pad(value)}</div>
          <div className="cs-cd-lbl">{label}</div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Verificar build e lint**

Run: `bun run build && bun run lint`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/features/coming-soon/Countdown.tsx
git commit -m "feat(coming-soon): add live countdown component"
```

---

## Task 7: Captura de e-mail

**Files:**

- Create: `src/features/coming-soon/EmailCapture.tsx`

- [ ] **Step 1: Criar `EmailCapture.tsx`**

```tsx
// src/features/coming-soon/EmailCapture.tsx
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";

const schema = z.object({
  email: z.string().email("Informe um e-mail válido"),
});

type FormValues = z.infer<typeof schema>;

/** Captura de e-mail (waitlist). Submit é mock — Fase 1 sem backend. */
export function EmailCapture() {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { email: "" } });

  const onSubmit = (_values: FormValues) => {
    toast.success("Você está na lista! Avisaremos no lançamento.");
    reset();
  };

  return (
    <form className="cs-form-wrap" onSubmit={handleSubmit(onSubmit)} noValidate>
      <div className="cs-form">
        <input
          type="email"
          placeholder="Seu melhor e-mail"
          aria-label="E-mail para a lista de espera"
          {...register("email")}
        />
        <button type="submit">Avise-me</button>
      </div>
      <p className="cs-form-error">{errors.email?.message ?? ""}</p>
    </form>
  );
}
```

- [ ] **Step 2: Verificar build e lint**

Run: `bun run build && bun run lint`
Expected: sem erros. (Confere que `react-hook-form`, `@hookform/resolvers` e `zod` resolvem — já são deps do projeto.)

- [ ] **Step 3: Commit**

```bash
git add src/features/coming-soon/EmailCapture.tsx
git commit -m "feat(coming-soon): add email waitlist capture form"
```

---

## Task 8: Composição da página

**Files:**

- Create: `src/features/coming-soon/ComingSoonPage.tsx`

- [ ] **Step 1: Criar `ComingSoonPage.tsx`**

```tsx
// src/features/coming-soon/ComingSoonPage.tsx
import { useEffect, useRef, useState } from "react";
import { Toaster } from "@/components/ui/sonner";
import { COMING_SOON } from "./config";
import { useBrandCycle } from "./useBrandCycle";
import { AuroraLayer } from "./AuroraLayer";
import { GridLayer } from "./GridLayer";
import { ParticleNetwork } from "./ParticleNetwork";
import { EmberField } from "./EmberField";
import { Countdown } from "./Countdown";
import { EmailCapture } from "./EmailCapture";
import "./coming-soon.css";

export function ComingSoonPage() {
  const rootRef = useRef<HTMLDivElement>(null);
  const rgbRef = useBrandCycle(rootRef);

  // anima a barra de progresso do 0 ao alvo após montar
  const [fill, setFill] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setFill(COMING_SOON.progressPercent));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div ref={rootRef} className="cs-root">
      <AuroraLayer />
      <GridLayer />
      <ParticleNetwork rgbRef={rgbRef} />
      <EmberField rgbRef={rgbRef} />

      <main className="cs-content">
        <img src="/logos/logo-horizontal-white.png" alt="GALLO Base Diesel" className="cs-logo" />

        <span className="cs-badge">Inteligência comercial · em construção</span>

        <h1 className="cs-headline">
          GALLO <span>BASE DIESEL</span>
        </h1>

        <p className="cs-sub">
          Estamos construindo a plataforma que vai operar acima do ERP como cérebro comercial. Em
          breve no ar.
        </p>

        <div className="cs-progress">
          <div className="cs-progress-meta">
            <span>Progresso da plataforma</span>
            <span>{COMING_SOON.progressPercent}%</span>
          </div>
          <div className="cs-progress-track">
            <div className="cs-progress-fill" style={{ width: `${fill}%` }} />
          </div>
        </div>

        <Countdown target={COMING_SOON.launchDate} />

        <EmailCapture />

        <nav className="cs-social" aria-label="Contato">
          <a href={COMING_SOON.contacts.whatsapp} target="_blank" rel="noreferrer">
            WhatsApp
          </a>
          <a href={COMING_SOON.contacts.instagram} target="_blank" rel="noreferrer">
            Instagram
          </a>
          <a href={`mailto:${COMING_SOON.contacts.email}`}>E-mail</a>
          <a href={`tel:${COMING_SOON.contacts.phone.replace(/\D/g, "")}`}>
            {COMING_SOON.contacts.phone}
          </a>
        </nav>
      </main>

      <footer className="cs-footer">GALLO Base Diesel · Frederico Westphalen/RS</footer>

      <Toaster richColors position="bottom-center" />
    </div>
  );
}
```

- [ ] **Step 2: Verificar build e lint**

Run: `bun run build && bun run lint`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/features/coming-soon/ComingSoonPage.tsx
git commit -m "feat(coming-soon): compose page with layers, content and toaster"
```

---

## Task 9: Ligar a rota `/`

**Files:**

- Modify: `src/routes/index.tsx` (substituição completa)

- [ ] **Step 1: Substituir `src/routes/index.tsx`**

Conteúdo completo do novo arquivo (remove o `beforeLoad`/redirect por auth; renderiza a página):

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { ComingSoonPage } from "@/features/coming-soon/ComingSoonPage";

/**
 * Root route — public "coming soon" page.
 * The app remains reachable via direct routes (/app, /loja, /auth).
 */
export const Route = createFileRoute("/")({
  component: ComingSoonPage,
});
```

- [ ] **Step 2: Verificar build e lint**

Run: `bun run build && bun run lint`
Expected: sem erros. O `routeTree.gen.ts` é regenerado pelo plugin durante o build — não editar à mão.

- [ ] **Step 3: Verificação visual (manual, pelo usuário)**

Com o dev server rodando (`bun run dev`, porta 5179), abrir `http://localhost:5179/` e confirmar:

- As 4 camadas aparecem e animam; rede reage ao mouse.
- Accent cicla Parts → Service → Industrial (~6s cada), afetando partículas, barra, botão e badge.
- Barra anima até 75%; countdown conta ao vivo; "Avise-me" valida e-mail e mostra toast.
- Contatos abrem WhatsApp/Instagram/mailto/tel.
- `/app/inicio` e `/loja` ainda carregam por URL direta.
- Reduzir a janela < 700px: rede com menos nós, sem brasas.

- [ ] **Step 4: Commit**

```bash
git add src/routes/index.tsx src/routeTree.gen.ts
git commit -m "feat(coming-soon): serve coming soon page at root route"
```

---

## Self-Review (preenchido)

**Spec coverage:**

- Rota `/` sempre, sem redirect → Task 9. ✓
- App acessível por rotas diretas → Task 9 (não há guard novo). ✓
- 4 camadas empilhadas (Abordagem B) → Tasks 3, 4, 5. ✓
- Multimarca animado → Task 1 (`useBrandCycle`), consumido em todas as camadas. ✓
- Captura de e-mail (mock + toast) → Task 7; Toaster montado na Task 8. ✓
- Countdown → Task 6. ✓
- Barra de progresso → Task 8 (composição). ✓
- Contato/redes → Task 8. ✓
- a11y/perf (reduced-motion, mobile, visibilitychange) → Tasks 1, 4, 5; CSS na 2. ✓
- Logos → usa `public/logos/logo-horizontal-white.png` existente (sem task de cópia). ✓
- Config (data, %, contatos) → Task 1. ✓

**Placeholder scan:** valores de `config.ts` são dados configuráveis (não placeholders de código). Nenhum "TODO/TBD" em código. ✓

**Type consistency:** `Rgb` e `useBrandCycle` definidos na Task 1; `ParticleNetwork`/`EmberField` importam `Rgb` e recebem `rgbRef: RefObject<Rgb>` (Tasks 4, 5); `ComingSoonPage` passa `rgbRef` retornado por `useBrandCycle` (Task 8). Classes CSS (`cs-*`) definidas na Task 2 e usadas nas Tasks 3–8 com nomes idênticos. ✓

## Nota fora de escopo

O `<Toaster>` global do sonner não é montado em nenhum lugar do app (só em `src/components/ui/sonner.tsx`). Esta página monta o seu próprio, então funciona isolada. A ausência do Toaster global pode fazer com que `toast()` em outras telas não apareça — vale investigar em tarefa separada.
