import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";

import appCss from "../styles.css?url";
import { ThemeProvider } from "@/components/ThemeProvider";

/**
 * Script anti-FOUC: aplica data-theme/data-mode + classe .dark
 * antes do primeiro paint, lendo localStorage e prefers-color-scheme.
 */
const ANTI_FOUC = `
(function () {
  try {
    var html = document.documentElement;
    var theme = localStorage.getItem('gallo-theme');
    if (!['diesel','parts','service','industrial'].includes(theme)) theme = 'diesel';
    var mode = localStorage.getItem('gallo-mode');
    if (!['light','dark','auto'].includes(mode)) mode = 'auto';
    var resolved = mode;
    if (mode === 'auto') {
      resolved = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    html.setAttribute('data-theme', theme);
    html.setAttribute('data-mode', resolved);
    if (resolved === 'dark') html.classList.add('dark');
  } catch (_e) {
    document.documentElement.setAttribute('data-theme','diesel');
    document.documentElement.setAttribute('data-mode','dark');
    document.documentElement.classList.add('dark');
  }
})();
`;

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Página não encontrada</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          A página que você procura não existe ou foi movida.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Voltar ao início
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Algo deu errado
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Tente recarregar ou voltar à página inicial.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Tentar novamente
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Início
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "GALLO BASE DIESEL — Plataforma de Inteligência Comercial" },
      {
        name: "description",
        content:
          "Plataforma proprietária GALLO BASE DIESEL — operação e inteligência comercial para peças, serviço e industrial.",
      },
      { name: "author", content: "GALLO BASE DIESEL" },
      { property: "og:title", content: "GALLO BASE DIESEL — Plataforma de Inteligência Comercial" },
      { property: "og:description", content: "Product Vision Now helps teams define and document product requirements." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "GALLO BASE DIESEL — Plataforma de Inteligência Comercial" },
      { name: "description", content: "Product Vision Now helps teams define and document product requirements." },
      { name: "twitter:description", content: "Product Vision Now helps teams define and document product requirements." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/60cc53d5-5373-41bc-aa6c-14a37bfcc641/id-preview-caf3a23b--fb6b6e4b-5bd9-433f-8ae1-388aff1464d0.lovable.app-1779721800625.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/60cc53d5-5373-41bc-aa6c-14a37bfcc641/id-preview-caf3a23b--fb6b6e4b-5bd9-433f-8ae1-388aff1464d0.lovable.app-1779721800625.png" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      {
        rel: "preconnect",
        href: "https://fonts.gstatic.com",
        crossOrigin: "anonymous",
      },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Saira+Condensed:wght@400;600;700&family=JetBrains+Mono:wght@400;500&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <script dangerouslySetInnerHTML={{ __html: ANTI_FOUC }} />
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <Outlet />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
