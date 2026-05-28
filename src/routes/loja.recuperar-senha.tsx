import { createFileRoute } from "@tanstack/react-router";
import { PasswordRecoveryPage } from "@/features/storefront-account";

export const Route = createFileRoute("/loja/recuperar-senha")({
  component: PasswordRecoveryPage,
});
