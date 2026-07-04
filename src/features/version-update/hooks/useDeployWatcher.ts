import { useEffect, useRef, useState } from "react";
import { fetchRemoteBuildId, getLocalBuildId } from "../lib/buildId";
import { hasNewDeploy } from "../engine/deployGate";

const POLL_INTERVAL_MS = 60_000;

export interface DeployWatcherResult {
  updateReady: boolean;
}

/**
 * Polls /version.json (production only) and flips `updateReady` to true once the
 * live build id differs from the one this bundle was built with. Checks on an
 * interval and whenever the tab regains focus/visibility (covers a tab left open
 * across several deploys). Stops polling once an update is detected. Fail-open:
 * a failed fetch is ignored and never raises a false positive.
 */
export function useDeployWatcher(): DeployWatcherResult {
  const [updateReady, setUpdateReady] = useState(false);
  const readyRef = useRef(false);

  useEffect(() => {
    if (!import.meta.env.PROD) return;

    const localBuildId = getLocalBuildId();
    const controller = new AbortController();
    let intervalId: ReturnType<typeof setInterval> | undefined;

    const check = async () => {
      if (readyRef.current) return;
      const remote = await fetchRemoteBuildId(controller.signal);
      if (hasNewDeploy(localBuildId, remote)) {
        readyRef.current = true;
        setUpdateReady(true);
        if (intervalId) clearInterval(intervalId);
      }
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };

    intervalId = setInterval(() => void check(), POLL_INTERVAL_MS);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    void check();

    return () => {
      controller.abort();
      if (intervalId) clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, []);

  return { updateReady };
}
