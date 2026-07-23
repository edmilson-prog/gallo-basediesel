import { useCallback, useEffect, useState } from "react";
import type {
  CopilotPlacement,
  ICopilotAssistantSettings,
  ICopilotBriefing,
  ICopilotSuggestion,
  ICopilotSummary,
  ID,
} from "@/shared/types";
import { useCopilotProvider } from "@/providers/data";
import { useCopilotPlacement } from "./useCopilotPlacement";
import { DEFAULT_COPILOT_ASSISTANT_SETTINGS } from "../config/defaults";

export interface IUseCopilotPanelOptions {
  /** When false the hook fetches nothing — the panel will not be rendered. */
  enabled?: boolean;
  /** How many recent messages the provider should read. */
  messageWindow?: number;
  /** Assistant behaviour parameters, echoed back on the returned state. */
  settings?: ICopilotAssistantSettings;
}

export interface ICopilotPanelState {
  placement: CopilotPlacement;
  briefing?: ICopilotBriefing;
  summary?: ICopilotSummary;
  suggestions: ICopilotSuggestion[];
  loading: boolean;
  /** True quando o provider falhou — a superfície deve degradar graciosamente. */
  error: boolean;
  /** Assistant behaviour parameters, so surfaces don't refetch them. */
  settings: ICopilotAssistantSettings;
  dismiss: (id: ID) => void;
}

export function useCopilotPanel(
  conversationId: ID | null,
  options?: IUseCopilotPanelOptions,
): ICopilotPanelState {
  const provider = useCopilotProvider();
  const placement = useCopilotPlacement();
  const [briefing, setBriefing] = useState<ICopilotBriefing | undefined>(undefined);
  const [summary, setSummary] = useState<ICopilotSummary | undefined>(undefined);
  const [allSuggestions, setAllSuggestions] = useState<ICopilotSuggestion[]>([]);
  const [dismissed, setDismissed] = useState<Set<ID>>(new Set());
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<boolean>(false);

  const enabled = options?.enabled ?? true;
  const messageWindow = options?.messageWindow;

  useEffect(() => {
    if (!conversationId || !enabled) {
      setBriefing(undefined);
      setSummary(undefined);
      setAllSuggestions([]);
      setLoading(false);
      setError(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(false);
    setDismissed(new Set());
    provider
      .getPanelData(conversationId, messageWindow ? { messageWindow } : undefined)
      .then((data) => {
        if (cancelled) return;
        setBriefing(data.briefing);
        setSummary(data.summary);
        setAllSuggestions(data.suggestions);
      })
      .catch(() => {
        if (cancelled) return;
        setError(true);
        setBriefing(undefined);
        setSummary(undefined);
        setAllSuggestions([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [provider, conversationId, enabled, messageWindow]);

  const dismiss = useCallback(
    (id: ID) => {
      setDismissed((prev) => new Set(prev).add(id));
      void provider.dismissSuggestion(id).catch(() => {
        /* silencioso: dispensa é local na Fase 1 */
      });
    },
    [provider],
  );

  const suggestions = allSuggestions.filter((s) => !dismissed.has(s.id));

  return {
    placement,
    briefing,
    summary,
    suggestions,
    loading,
    error,
    settings: options?.settings ?? DEFAULT_COPILOT_ASSISTANT_SETTINGS,
    dismiss,
  };
}
