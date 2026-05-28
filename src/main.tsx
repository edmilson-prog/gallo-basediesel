import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { getRouter } from "@/router";
import "@/styles.css";

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
