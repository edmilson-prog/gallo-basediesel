import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Outlet, Link, createRootRouteWithContext, useRouter } from "@tanstack/react-router";

import { ThemeProvider } from "@/components/ThemeProvider";
import { Toaster } from "@/components/ui/sonner";
import { CopilotSettingsProvider } from "@/features/copilot";
import { AuthProvider } from "@/features/auth/AuthProvider";
import { MultistoreProvider } from "@/features/multistore";
import { RbacHydrator } from "@/features/rbac";
import { isChunkLoadError, ChunkErrorScreen } from "@/features/version-update";
import { DataProvidersProvider } from "@/providers/data";
import { NotificationProvidersProvider } from "@/providers/notifications";

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

  if (isChunkLoadError(error)) {
    return <ChunkErrorScreen />;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Algo deu errado</h1>
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
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <CopilotSettingsProvider>
          <DataProvidersProvider>
            <NotificationProvidersProvider>
              <AuthProvider>
                {/*
                  Must sit UNDER <AuthProvider>: the persisted RBAC matrix is
                  readable by `authenticated` only, so hydrating it from here at
                  boot (above the provider, on the login screen) loaded an empty
                  matrix that hid every permission-gated menu item until reload.
                */}
                <RbacHydrator />
                <MultistoreProvider>
                  <Outlet />
                  {/*
                    Render surface for every `toast()` call in the app (~190
                    modules). Without it sonner queues toasts into the void:
                    no element, no warning, no console trace — which is exactly
                    how an oversized attachment could be rejected while the
                    user saw nothing at all. Bottom-right is sonner's default
                    and the position the owner asked for.
                  */}
                  <Toaster position="bottom-right" duration={5000} closeButton />
                </MultistoreProvider>
              </AuthProvider>
            </NotificationProvidersProvider>
          </DataProvidersProvider>
        </CopilotSettingsProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
