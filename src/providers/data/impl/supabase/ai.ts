import type { IAiProvider } from "../../contracts/ai";
import { NotImplementedError } from "../../errors";

const NOT_YET =
  "Provider de IA no Supabase será implementado na fase de integração real (Edge proxy + tabelas).";

/** Every method is unimplemented until the real LLM integration phase. */
function notYet(): never {
  throw new NotImplementedError(NOT_YET);
}

export const supabaseAiProvider: IAiProvider = {
  getSettings: notYet,
  setMasterEnabled: notYet,
  setDefaultProvider: notYet,
  updateBudget: notYet,
  updateProviderConfig: notYet,
  testConnection: notYet,
  updateFeatureRouting: notYet,
  getUsageSummary: notYet,
  listUsageEvents: notYet,
  runPlayground: notYet,
};
