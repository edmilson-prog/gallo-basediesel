import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { LoginPage } from "@/features/storefront-account";

const searchSchema = z.object({
  return: z.string().optional(),
});

export const Route = createFileRoute("/loja/login")({
  validateSearch: searchSchema,
  component: LoginRoute,
});

function LoginRoute() {
  const { return: returnTo } = Route.useSearch();
  return <LoginPage returnTo={returnTo} />;
}
