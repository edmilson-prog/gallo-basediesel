// src/features/tour/components/Spotlight.tsx

// Dimmed overlay with a cutout over the target. The inset-0 container captures
// clicks (blocks the app during a step). The dark scrim is painted by a huge
// box-shadow on the cutout box; when there is no target, the whole screen dims.
export function Spotlight({ rect }: { rect: DOMRect | null }) {
  const pad = 6;
  return (
    <div className="fixed inset-0 z-50" aria-hidden="true">
      {rect ? (
        <div
          className="absolute rounded-md ring-2 ring-primary transition-all duration-200 motion-reduce:transition-none"
          style={{
            top: rect.top - pad,
            left: rect.left - pad,
            width: rect.width + pad * 2,
            height: rect.height + pad * 2,
            boxShadow: "0 0 0 9999px rgba(2,6,23,0.55)",
          }}
        />
      ) : (
        <div className="absolute inset-0" style={{ background: "rgba(2,6,23,0.55)" }} />
      )}
    </div>
  );
}
