import { useCallback, useEffect, useRef, useState } from "react";
import type { ID } from "@/shared/types";
import { useCopilotProvider } from "@/providers/data";

export interface ICopilotReplyState {
  enabled: boolean;
  generating: boolean;
  reply: string | null;
  error: string | null;
  generate: () => void;
  clear: () => void;
}

export function useCopilotReply(conversationId: ID | null): ICopilotReplyState {
  const provider = useCopilotProvider();
  const [enabled, setEnabled] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [reply, setReply] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Guards against a late response landing on a different conversation.
  const reqRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    provider
      .isReplyGenerationEnabled()
      .then((v) => {
        if (!cancelled) setEnabled(v);
      })
      .catch(() => {
        if (!cancelled) setEnabled(false);
      });
    return () => {
      cancelled = true;
    };
  }, [provider]);

  // Reset transient state when switching conversations.
  useEffect(() => {
    reqRef.current += 1;
    setReply(null);
    setError(null);
    setGenerating(false);
  }, [conversationId]);

  const generate = useCallback(() => {
    if (!conversationId) return;
    const reqId = (reqRef.current += 1);
    setGenerating(true);
    setError(null);
    provider
      .generateReply(conversationId)
      .then((text) => {
        if (reqRef.current === reqId) setReply(text);
      })
      .catch((e: unknown) => {
        if (reqRef.current === reqId) {
          setError(e instanceof Error ? e.message : "Falha ao gerar a resposta. Tente novamente.");
        }
      })
      .finally(() => {
        if (reqRef.current === reqId) setGenerating(false);
      });
  }, [provider, conversationId]);

  const clear = useCallback(() => {
    setReply(null);
    setError(null);
  }, []);

  return { enabled, generating, reply, error, generate, clear };
}
