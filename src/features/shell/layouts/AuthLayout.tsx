import { Outlet } from "@tanstack/react-router";
import { Logo } from "@/components/Logo";

/**
 * Centered layout for /auth/* — login mockado.
 * Logo prominent, no sidebar, no top bar.
 */
export function AuthLayout({ children }: { children?: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="flex justify-center pt-12 pb-6 sm:pt-20">
        <Logo variant="horizontal" className="h-10" />
      </header>
      <main className="flex flex-1 items-start justify-center px-4 pb-12">
        <div className="w-full max-w-3xl">{children ?? <Outlet />}</div>
      </main>
    </div>
  );
}
