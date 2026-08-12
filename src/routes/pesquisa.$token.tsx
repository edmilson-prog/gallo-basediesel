import { createFileRoute } from "@tanstack/react-router";
import { NpsSurveyPublicPage } from "@/features/nps";

/**
 * Public NPS landing — deliberately at the router root, outside /app, /loja,
 * /pwa and /portal, so it inherits none of their auth guards. The token in the
 * path is the only credential involved.
 */
export const Route = createFileRoute("/pesquisa/$token")({
  component: NpsSurveyPublicPage,
});
