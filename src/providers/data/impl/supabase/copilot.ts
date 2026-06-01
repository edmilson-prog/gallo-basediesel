import { NotImplementedError } from "../../errors";
import type { ICopilotProvider } from "../../contracts/copilot";

const stub = (method: string) => () => {
  throw new NotImplementedError(
    `CopilotProvider.${method} — implementação Supabase pendente (Fase 2 — AICopilotProvider).`,
  );
};

export const supabaseCopilotProvider: ICopilotProvider = {
  getPanelData: stub("getPanelData"),
  dismissSuggestion: stub("dismissSuggestion"),
};
