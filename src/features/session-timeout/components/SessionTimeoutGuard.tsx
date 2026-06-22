import { useSessionTimeout } from "../hooks/useSessionTimeout";
import { SessionTimeoutModal } from "./SessionTimeoutModal";

/**
 * Drives the idle-timeout orchestrator and renders the warning modal. Mount once
 * inside the authenticated app layout (AppLayout). Renders nothing while active.
 */
export function SessionTimeoutGuard() {
  const { warningOpen, secondsLeft, warningTotalSeconds, stayConnected, logoutNow } =
    useSessionTimeout();
  return (
    <SessionTimeoutModal
      open={warningOpen}
      secondsLeft={secondsLeft}
      totalSeconds={warningTotalSeconds}
      onStayConnected={stayConnected}
      onLogoutNow={logoutNow}
    />
  );
}
