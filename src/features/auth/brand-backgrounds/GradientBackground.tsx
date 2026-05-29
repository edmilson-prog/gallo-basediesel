import { Icon } from "@/components/Icon";

/** Variant B: drifting gold gradient blobs + slow gear + floating 3D drop. CSS only. */
export function GradientBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
      <style>{`
        @keyframes gp-drift1 { to { transform: translate(60px,40px) scale(1.15); } }
        @keyframes gp-drift2 { to { transform: translate(-50px,-30px) scale(1.2); } }
        @keyframes gp-spin { to { transform: rotate(360deg); } }
        @keyframes gp-float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-14px); } }
        @media (prefers-reduced-motion: reduce) { .gp-anim { animation: none !important; } }
      `}</style>
      <span
        className="gp-anim absolute -left-10 -top-8 h-56 w-56 rounded-full blur-3xl mix-blend-screen"
        style={{
          background: "#c9a24a",
          opacity: 0.5,
          animation: "gp-drift1 11s ease-in-out infinite alternate",
        }}
      />
      <span
        className="gp-anim absolute -bottom-6 -right-8 h-48 w-48 rounded-full blur-3xl mix-blend-screen"
        style={{
          background: "#7a3d12",
          opacity: 0.55,
          animation: "gp-drift2 13s ease-in-out infinite alternate",
        }}
      />
      <span
        className="gp-anim absolute -bottom-16 -right-16 text-foreground opacity-[0.05]"
        style={{ animation: "gp-spin 40s linear infinite" }}
      >
        <Icon icon="mdi:cog" size={260} />
      </span>
      <img
        src="/logos/gota-3d.png"
        alt=""
        className="gp-anim pointer-events-none absolute right-10 top-[36%] w-28 drop-shadow-[0_0_30px_rgba(201,162,74,0.45)]"
        style={{ animation: "gp-float 5s ease-in-out infinite" }}
      />
    </div>
  );
}
