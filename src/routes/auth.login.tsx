import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/features/auth/useAuth";
import { MOCK_USERS } from "@/features/auth/mock-users";
import { toast } from "sonner";

const searchSchema = z.object({
  next: z.string().optional(),
});

export const Route = createFileRoute("/auth/login")({
  validateSearch: searchSchema,
  component: LoginPage,
});

function LoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const { next } = Route.useSearch();
  const [pendingId, setPendingId] = useState<string | null>(null);

  const handleSelect = (id: string) => {
    setPendingId(id);
    const profile = signIn(id);
    if (!profile) {
      toast.error("Perfil não encontrado.");
      setPendingId(null);
      return;
    }
    const target = next ?? profile.defaultRedirect;
    void navigate({ to: target });
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-semibold tracking-tight">Bem-vindo à plataforma</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Escolha um perfil para continuar. Esta autenticação é mockada — apenas para demonstração.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {MOCK_USERS.map((user) => (
          <Card
            key={user.id}
            className="cursor-pointer transition-shadow hover:shadow-lg"
            onClick={() => handleSelect(user.id)}
          >
            <CardHeader className="text-center">
              <div className="flex justify-center">
                <Avatar className="h-16 w-16">
                  <AvatarFallback className="bg-primary text-lg text-primary-foreground">
                    {user.avatarInitials}
                  </AvatarFallback>
                </Avatar>
              </div>
              <CardTitle className="mt-3 text-lg">{user.displayName}</CardTitle>
              <div className="flex justify-center gap-2">
                <Badge variant="secondary">{user.role}</Badge>
                <Badge variant="outline">{user.storeLabel}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-center text-sm text-muted-foreground">{user.description}</p>
              <Button className="w-full" disabled={pendingId === user.id}>
                {pendingId === user.id ? "Entrando…" : `Entrar como ${user.role}`}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <p className="text-center text-xs text-muted-foreground">
        Esta é uma fase de mockup. Autenticação real será habilitada na Fase 2 (Supabase Auth).
      </p>
    </div>
  );
}
