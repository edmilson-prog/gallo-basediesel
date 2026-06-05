import { useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { IMediaAsset, IMessage } from "@/shared/types";
import { useMediaStorageProvider } from "@/providers/data";

/** What to do with a single inbound message's potential media. */
export type InboundAction = "skip" | "create" | "dedup" | "retry";

export interface IInboundDecision {
  action: InboundAction;
  /** The asset to return when dedup/retry (already known). */
  existing?: IMediaAsset;
}

/**
 * Pure decision for inbound media archival. No side effects — drives the hook
 * and is fully unit-tested. Rules (D-3, RF-006/007/008):
 *  - skip: message has no media OR is not inbound (direction !== "in").
 *  - dedup: an asset already exists for this message and is persisted.
 *  - retry: an asset exists but persisted === false (archival not done yet).
 *  - create: no asset yet.
 */
export function resolveInboundAsset(
  message: IMessage,
  existing: IMediaAsset | null,
): IInboundDecision {
  if (message.direction !== "in" || !message.mediaType) return { action: "skip" };
  if (!existing) return { action: "create" };
  if (existing.persisted === false) return { action: "retry", existing };
  return { action: "dedup", existing };
}

/**
 * Ensure every inbound media message becomes a persisted asset, without ever
 * blocking the conversation. Returns an imperative `ensure(message, existing)`
 * that fires a background mutation for create/retry and is a no-op otherwise.
 * On settle it invalidates the media query cache so open galleries refresh.
 */
export function useEnsureInboundMedia() {
  const provider = useMediaStorageProvider();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (message: IMessage) => provider.ensureFromMessage(message),
    retry: 2,
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["media"] });
    },
  });

  const ensure = useCallback(
    (message: IMessage, existing: IMediaAsset | null) => {
      const decision = resolveInboundAsset(message, existing);
      if (decision.action === "create" || decision.action === "retry") {
        // Fire-and-forget: persistence never blocks the conversation (RF-008).
        mutation.mutate(message);
      }
      return decision;
    },
    [mutation],
  );

  return { ensure, isPending: mutation.isPending };
}
