import { createFileRoute } from "@tanstack/react-router";
import { SetPasswordPage } from "@/features/auth/SetPasswordPage";

export const Route = createFileRoute("/auth/definir-senha")({
  component: SetPasswordPage,
});
