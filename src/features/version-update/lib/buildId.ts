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

/**
 * Reads the build id currently live in production. Fail-open: any failure
 * (offline, 404 in dev, non-JSON, aborted) resolves to null so the caller never
 * raises a false positive and never throws.
 */
export async function fetchRemoteBuildId(signal?: AbortSignal): Promise<string | null> {
  try {
    const res = await fetch("/version.json", { cache: "no-store", signal });
    if (!res.ok) return null;
    return parseVersionJson(await res.text());
  } catch {
    return null;
  }
}
