/** The build id compiled into this bundle. Guarded for envs without the define. */
export function getLocalBuildId(): string {
  return typeof __BUILD_ID__ !== "undefined" ? __BUILD_ID__ : "dev";
}

/** Extracts a valid buildId from the raw /version.json body, or null. */
export function parseVersionJson(text: string): string | null {
  try {
    const data = JSON.parse(text) as { buildId?: unknown };
    return typeof data.buildId === "string" && data.buildId.length > 0 ? data.buildId : null;
  } catch {
    return null;
  }
}

/** What the /version.json probe actually answered, decoupled from fetch. */
export interface IVersionProbe {
  ok: boolean;
  status: number;
  contentType: string | null;
  body: string;
}

/**
 * Pure classifier for the /version.json probe (issue #430).
 *
 * The SPA rewrite used to answer 200 text/html for ANY missing file, so a
 * missing manifest silently muted the "new version" watcher forever — no log,
 * no Sentry, users stuck on an old build with zero signal. Classifying the
 * response (instead of trusting `res.ok`) makes every unusable answer produce
 * a warning string the caller can surface.
 */
export function classifyVersionResponse(probe: IVersionProbe): {
  buildId: string | null;
  warning: string | null;
} {
  const contentType = (probe.contentType ?? "").toLowerCase();
  if (contentType.includes("text/html")) {
    return {
      buildId: null,
      warning:
        "/version.json answered HTML (SPA rewrite fallback?) — deploy watcher is inoperative",
    };
  }
  if (!probe.ok) {
    return {
      buildId: null,
      warning: `/version.json answered ${probe.status} — deploy watcher is inoperative`,
    };
  }
  const buildId = parseVersionJson(probe.body);
  if (buildId === null) {
    return {
      buildId: null,
      warning: "/version.json body did not contain a buildId — deploy watcher is inoperative",
    };
  }
  return { buildId, warning: null };
}

/** One console.warn per distinct reason per session — the watcher polls every minute. */
const warnedReasons = new Set<string>();

/**
 * Reads the build id currently live in production. Fail-open: any failure
 * (offline, 404 in dev, non-JSON, aborted) resolves to null so the caller never
 * raises a false positive and never throws. Unusable RESPONSES (as opposed to
 * network failures) additionally leave a PROD-only console trace, so a mute
 * watcher is diagnosable instead of silent (issue #430).
 */
export async function fetchRemoteBuildId(signal?: AbortSignal): Promise<string | null> {
  try {
    const res = await fetch("/version.json", { cache: "no-store", signal });
    const { buildId, warning } = classifyVersionResponse({
      ok: res.ok,
      status: res.status,
      contentType: res.headers.get("content-type"),
      body: await res.text(),
    });
    if (warning && import.meta.env.PROD && !warnedReasons.has(warning)) {
      warnedReasons.add(warning);
      console.warn(`[version-update] ${warning}`);
    }
    return buildId;
  } catch {
    // Offline/aborted: normal transient conditions, stay silent.
    return null;
  }
}
