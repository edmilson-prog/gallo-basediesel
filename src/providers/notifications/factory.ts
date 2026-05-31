import type { INotificationStores } from "./contracts";

import { mockNotificationStore } from "./impl/mock/notifications";
import { mockNotificationPreferenceStore } from "./impl/mock/preferences";

import { supabaseNotificationStore } from "./impl/supabase/notifications";
import { supabaseNotificationPreferenceStore } from "./impl/supabase/preferences";

type DataSource = "mock" | "supabase";

const VALID_SOURCES: readonly DataSource[] = ["mock", "supabase"] as const;

function resolveDataSource(): DataSource {
  const raw = import.meta.env.VITE_DATA_SOURCE;
  if (raw && (VALID_SOURCES as readonly string[]).includes(raw)) {
    return raw as DataSource;
  }
  if (raw && import.meta.env.DEV) {
    console.warn(
      `[providers/notifications] VITE_DATA_SOURCE="${raw}" is not a valid data source. ` +
        `Falling back to "mock". Allowed values: ${VALID_SOURCES.join(", ")}.`,
    );
  }
  return "mock";
}

const DATA_SOURCE: DataSource = resolveDataSource();

if (import.meta.env.DEV) {
  console.info(`[providers/notifications] active data source: "${DATA_SOURCE}"`);
}

const mockNotificationStores: INotificationStores = {
  notifications: mockNotificationStore,
  preferences: mockNotificationPreferenceStore,
};

const supabaseNotificationStores: INotificationStores = {
  notifications: supabaseNotificationStore,
  preferences: supabaseNotificationPreferenceStore,
};

/**
 * Returns the singleton bundle of notification stores selected by the build-time
 * `VITE_DATA_SOURCE` environment variable. The same instance is returned on
 * every call so React Context propagation stays stable.
 */
export function getNotificationStores(): INotificationStores {
  return DATA_SOURCE === "supabase" ? supabaseNotificationStores : mockNotificationStores;
}
