import { useEffect, useRef } from "react";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { RGBShiftShader } from "three/examples/jsm/shaders/RGBShiftShader.js";

const GOLD = 0xc9a24a;

/** Variant C: cinematic gold dot-wave mesh with bloom. three.js (lazy-loaded). */
export default function MeshWaveBackground() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const renderer = new THREE.WebGLRenderer({
      antialias: false,
      alpha: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera();

    const renderPass = new RenderPass(scene, camera);
    const bloom = new UnrealBloomPass(
      new THREE.Vector2(container.clientWidth, container.clientHeight),
      0.5,
      0.8,
      0.1,
    );
    const rgbShift = new ShaderPass(RGBShiftShader);
    (rgbShift.uniforms as Record<string, THREE.IUniform>)["amount"]!.value = 0.0015;
    (rgbShift.uniforms as Record<string, THREE.IUniform>)["angle"]!.value = Math.PI / 4;
    const composer = new EffectComposer(renderer);
    composer.addPass(renderPass);
    composer.addPass(bloom);
    composer.addPass(rgbShift);

    const GRID = { cols: 70, rows: 70, jitter: 0.3, hexOffset: 0.5, dotRadius: 0.03, spacing: 0.6 };
    const total = GRID.cols * GRID.rows;
    const geometry = new THREE.CircleGeometry(GRID.dotRadius, 8);
    const material = new THREE.MeshBasicMaterial({ color: GOLD });
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
        y += (c % 2) * GRID.hexOffset * GRID.spacing;
        x += (Math.random() - 0.5) * GRID.jitter;
        y += (Math.random() - 0.5) * GRID.jitter;
        basePos[idx * 2] = x;
        basePos[idx * 2 + 1] = y;
        const len = Math.hypot(x, y);
        const ang = Math.atan2(y, x);
        distArr[idx] = len + 0.5 * Math.cos(ang * 8) * 0.75;
        dummy.position.set(x, y, 0);
        dummy.updateMatrix();
        dots.setMatrixAt(idx, dummy.matrix);
      }
    }

    const roundedSquareWave = (t: number, delta: number, a: number, f: number) =>
      ((2 * a) / Math.PI) * Math.atan(Math.sin(2 * Math.PI * t * f) / delta);

    const clock = new THREE.Clock();
    const mat = new THREE.Matrix4();
    let frame = 0;

    const resize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      const aspect = w / h || 1;
      const worldHeight = 10;
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
      composer.setSize(w, h);
      bloom.setSize(w, h);
    };

    const animate = () => {
      frame = requestAnimationFrame(animate);
      const t = clock.getElapsedTime();
      const speed = 0.5;
      const amp = 0.75;
      const freq = 0.3;
      const falloff = 0.035;
      for (let i = 0; i < total; i++) {
        const x0 = basePos[i * 2] as number;
        const y0 = basePos[i * 2 + 1] as number;
        const dist = distArr[i] as number;
        const localDelta = THREE.MathUtils.lerp(0.05, 0.2, Math.min(1, dist / 70));
        const tt = t * speed - dist * falloff;
        const k = 1 + roundedSquareWave(tt, localDelta, amp, freq);
        mat.set(1, 0, 0, x0 * k, 0, 1, 0, y0 * k, 0, 0, 1, 0, 0, 0, 0, 1);
        dots.setMatrixAt(i, mat);
      }
      dots.instanceMatrix.needsUpdate = true;
      composer.render();
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);
    if (reduce) composer.render();
    else frame = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) container.removeChild(renderer.domElement);
    };
  }, []);

  return <div ref={containerRef} className="absolute inset-0 h-full w-full" aria-hidden="true" />;
}
