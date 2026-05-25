import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/features/auth/useAuth";

export const Route = createFileRoute("/auth/logout")({
  component: LogoutPage,
});

function LogoutPage() {
  const { signOut } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    signOut();
    void navigate({ to: "/auth/login", replace: true });
  }, [signOut, navigate]);

  return <p className="text-center text-sm text-muted-foreground">Encerrando sessão…</p>;
}
