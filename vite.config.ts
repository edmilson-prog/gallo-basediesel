import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { tanstackRouter } from "@tanstack/router-plugin/vite";

// SPA estática — sem SSR. Gera `dist/` com `index.html` + assets,
// pronto para a Vercel (ou qualquer host estático) servir como SPA.
export default defineConfig({
  plugins: [
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,
    }),
    react(),
    tailwindcss(),
    tsconfigPaths(),
  ],
  server: {
    watch: {
      // Nested git worktrees (`.claude/worktrees/*`) and brainstorm sessions
      // (`.superpowers/*`) are full repo copies with their own index.html /
      // tsconfig.json. Watching them makes Vite trigger reload loops and crash.
      ignored: ["**/.claude/**", "**/.superpowers/**"],
    },
  },
});
