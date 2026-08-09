import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { SETTINGS_GROUPS } from "./SettingsLayout";

/**
 * Menu ↔ route guard parity for /app/configuracoes/*.
 *
 * Two independent gates decide whether a settings screen is reachable: the
 * sidebar entry in SETTINGS_GROUPS, and the `beforeLoad` guard on the route.
 * When they disagree the user gets a dead end — the item shows up in the menu
 * and the click lands on /sem-permissao (or, the other way around, a screen
 * stays reachable by URL after being hidden).
 *
 * `requireAuth(pathname, roles, permission)` demands BOTH arguments, so a route
 * that carries a role allowlist *and* a permission silently caps the matrix: the
 * Role Editor can then only restrict, never widen. That is the bug this file
 * pins down.
 */

const ROUTES_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../../../routes");

/** `/app/configuracoes/atendimento/pipeline` → `app.configuracoes.atendimento.pipeline.tsx` */
function routeFileFor(to: string): string {
  return resolve(ROUTES_DIR, to.replace(/^\//, "").replace(/\//g, ".") + ".tsx");
}

interface IGuard {
  roles: string[] | null;
  permission: { resource: string; action: string } | null;
}

function parseGuard(source: string): IGuard | null {
  const start = source.indexOf("requireAuth(location.pathname");
  if (start === -1) return null;
  let depth = 1;
  let i = start + "requireAuth(".length;
  while (i < source.length && depth > 0) {
    if (source[i] === "(") depth++;
    else if (source[i] === ")") depth--;
    if (depth === 0) break;
    i++;
  }
  const args = source.slice(start, i).replace(/\s+/g, " ");
  const rolesMatch = args.match(/,\s*\[([^\]]*)\]/);
  const permMatch = args.match(/resource:\s*"(\w+)"\s*,\s*action:\s*"(\w+)"/);
  return {
    roles: rolesMatch ? rolesMatch[1].split(",").map((s) => s.trim().replace(/"/g, "")) : null,
    permission: permMatch ? { resource: permMatch[1], action: permMatch[2] } : null,
  };
}

const ITEMS = SETTINGS_GROUPS.flatMap((g) => g.items).filter((it) =>
  existsSync(routeFileFor(it.to)),
);

describe("SettingsLayout ↔ route guards", () => {
  it("cobre as telas do menu que têm arquivo de rota próprio", () => {
    // Guards against the parser silently matching nothing and the suite passing empty.
    expect(ITEMS.length).toBeGreaterThan(30);
  });

  it.each(ITEMS.map((it) => [it.label, it] as const))(
    "%s — o guard da rota concorda com o menu",
    (label, item) => {
      const guard = parseGuard(readFileSync(routeFileFor(item.to), "utf8"));
      expect(guard, `"${label}" deve ter um guard requireAuth`).not.toBeNull();

      if (item.permission) {
        // The menu is matrix-driven, so the route must be too — and must NOT add a
        // role ceiling on top, which would make the matrix grant inert.
        expect(guard!.permission, `"${label}": rota deve usar a mesma permissão do menu`).toEqual({
          resource: item.permission.resource,
          action: item.permission.action,
        });
        expect(
          guard!.roles,
          `"${label}": rota não pode ter allowlist de papéis junto da permissão — ` +
            `requireAuth exige AMBOS, então a matriz vira inerte`,
        ).toBeNull();
      } else if (item.roles) {
        // A dead end is the route being STRICTER than the menu: the item shows up
        // and the click bounces to /sem-permissao. A route with no allowlist is
        // fine — the /app shell guard already narrows the field.
        if (guard!.roles) {
          const barred = item.roles.filter((r) => !guard!.roles!.includes(r));
          expect(
            barred,
            `"${label}": o menu mostra para ${barred.join(", ")}, mas a rota barra — ` +
              `beco sem saída (/sem-permissao)`,
          ).toEqual([]);
        }
        // Conversely, a role-gated menu entry whose route demands a permission the
        // listed roles may not hold is the same dead end in disguise.
        expect(
          guard!.permission,
          `"${label}": menu usa allowlist mas a rota exige permissão — ` +
            `alinhe os dois lados (de preferência migrando o menu para a matriz)`,
        ).toBeNull();
      }
    },
  );
});
