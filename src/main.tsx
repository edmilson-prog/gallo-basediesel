import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { getRouter } from "@/router";
import { initObservability } from "@/shared/lib/observability";
import { initPreloadErrorHandler } from "@/features/version-update";
import "@/styles.css";

// PRD-110: error tracking boots before the first render so early crashes are
// captured. No-op (zero overhead) when VITE_SENTRY_DSN is not configured.
initObservability();

// Recover a failed lazy-chunk load (removed by a newer deploy) by reloading onto
// the new build instead of throwing — see src/features/version-update.
initPreloadErrorHandler();

// QueryClientProvider e ThemeProvider são injetados pelo RootComponent
// em src/routes/__root.tsx — o queryClient sai do router context.
const router = getRouter();

const container = document.getElementById("root");
if (!container) throw new Error("Root container #root not found in index.html");

ReactDOM.createRoot(container).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);

// PRD-070 RF-022: register the static-asset service worker (production only —
// avoids interfering with Vite's dev HMR). MVP caches assets only; no offline.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js").catch(() => {
      // Registration failures must never break the app — ignore silently.
    });
  });
}
