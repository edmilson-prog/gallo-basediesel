import { createFileRoute } from "@tanstack/react-router";
import { SettingsLayout } from "@/features/shell/layouts";
import { requireAuth } from "@/features/auth/guards";
import { AuditLogPage, type IAuditLogSearch } from "@/features/rbac/pages/AuditLogPage";

function parseStringArray(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    const cleaned = value.filter((v): v is string => typeof v === "string" && v.length > 0);
    return cleaned.length > 0 ? cleaned : undefined;
  }
  if (typeof value === "string" && value.length > 0) {
    const parts = value
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
    return parts.length > 0 ? parts : undefined;
  }
  return undefined;
}

function parseDate(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  // Accept ISO date (YYYY-MM-DD) — the page uses date inputs.
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
}

function parsePage(value: unknown): number | undefined {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : undefined;
}

export const Route = createFileRoute("/app/configuracoes/auditoria")({
  beforeLoad: ({ location }) =>
    requireAuth(location.pathname, undefined, { resource: "audit_log", action: "view" }),
  validateSearch: (raw: Record<string, unknown>): IAuditLogSearch => ({
    actorIds: parseStringArray(raw.actorIds),
    actions: parseStringArray(raw.actions),
    resources: parseStringArray(raw.resources),
    since: parseDate(raw.since),
    until: parseDate(raw.until),
    page: parsePage(raw.page),
  }),
  component: AuditLogRoute,
});

function AuditLogRoute() {
  return (
    <SettingsLayout>
      <AuditLogPage routeId="/app/configuracoes/auditoria" />
    </SettingsLayout>
  );
}
