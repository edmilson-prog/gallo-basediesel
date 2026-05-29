import { createFileRoute } from "@tanstack/react-router";
import { ComingSoonPage } from "@/features/coming-soon/ComingSoonPage";

/**
 * Root route — public "coming soon" page.
 * The app remains reachable via direct routes (/app, /loja, /auth).
 */
export const Route = createFileRoute("/")({
  component: ComingSoonPage,
});
