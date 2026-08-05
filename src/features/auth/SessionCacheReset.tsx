import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "./useAuth";
import { shouldResetSessionCache, type ObservedIdentity } from "./engine/sessionCacheReset";

/**
 * Drops the TanStack Query cache when the tab changes hands.
 *
 * Renders nothing. Must sit under both `QueryClientProvider` and `AuthProvider`.
 *
 * The `QueryClient` is instantiated once outside React and never cleared, so it
 * survives sign-out: every list, dashboard and conversation the previous user
 * loaded is still in memory when the next one signs in, and TanStack serves
 * those cached entries first while the fresh request is in flight. RLS still
 * governs what the refetch can return — this is about not showing user A's data
 * to user B in the meantime.
 *
 * Deliberately narrow: it clears on an identity handover and does nothing else.
 * No query keys, no `staleTime`, no refetch policy — the cache behaviour of a
 * running session is untouched.
 *
 * @see engine/sessionCacheReset.ts for exactly when a reset fires.
 */
export function SessionCacheReset(): null {
  const queryClient = useQueryClient();
  const { currentUser } = useAuth();
  // Key on the id: the profile object is re-created on every TOKEN_REFRESHED.
  const identity = currentUser?.id ?? null;
  const observed = useRef<ObservedIdentity>(undefined);

  useEffect(() => {
    const previous = observed.current;
    observed.current = identity;
    if (shouldResetSessionCache(previous, identity)) {
      queryClient.clear();
    }
  }, [identity, queryClient]);

  return null;
}
