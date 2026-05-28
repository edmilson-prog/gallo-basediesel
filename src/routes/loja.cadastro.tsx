import { createFileRoute } from "@tanstack/react-router";
import { RegisterPage } from "@/features/storefront-account";

export const Route = createFileRoute("/loja/cadastro")({
  component: RegisterPage,
});
