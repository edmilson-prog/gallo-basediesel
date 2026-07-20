import { useCallback, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/useAuth";
import { useCurrentStore } from "@/features/multistore";
import { useSettingsProvider } from "@/providers/data";
import { useAudioUnlock } from "@/shared/hooks/useAudioUnlock";
import type { ISoundSettings, SoundEventId } from "@/shared/types";
import { createSoundPlayer, type ISoundPlayer } from "../lib/soundPlayer";

const DEFAULT_STORE_ID = "00000000-0000-0000-0000-000000000001";

/**
 * Returns a stable `play(eventId)` that synthesizes the sound configured for the
 * current store. Reads `["settings", storeId]` (shared React Query cache) and
 * keeps it in a ref, so `play` never changes identity — safe to call from
 * effects without adding it to their dependency array.
 */
export function useSoundEventPlayer(): { play: (eventId: SoundEventId) => void } {
  const { currentUser } = useAuth();
  const { currentStoreId } = useCurrentStore();
  const storeId = currentStoreId ?? DEFAULT_STORE_ID;
  const settingsProvider = useSettingsProvider();

  const settingsQuery = useQuery({
    queryKey: ["settings", storeId],
    queryFn: () => settingsProvider.get(storeId),
    enabled: Boolean(currentUser),
    staleTime: 5 * 60_000,
  });

  const soundRef = useRef<ISoundSettings | undefined>(undefined);
  soundRef.current = settingsQuery.data?.sound;

  const playerRef = useRef<ISoundPlayer | null>(null);
  if (!playerRef.current) playerRef.current = createSoundPlayer();
  useEffect(() => () => playerRef.current?.dispose(), []);

  const unlock = useCallback(() => playerRef.current?.unlock(), []);
  useAudioUnlock(unlock, true);

  const play = useCallback((eventId: SoundEventId) => {
    playerRef.current?.play(eventId, soundRef.current);
  }, []);

  return { play };
}
