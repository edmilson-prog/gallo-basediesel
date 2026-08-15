import { useCallback, useState } from "react";

export interface IPwaNotifyPrefs {
  /** Push while the app is closed. */
  push: boolean;
  /** Push when a conversation goes red on the waiting light (30 min). */
  waiting: boolean;
  /** In-app band for a message from another conversation. */
  inApp: boolean;
  sound: boolean;
  /** Silence between 22h and 6h. */
  quiet: boolean;
}

export const PWA_NOTIFY_PREFS_KEY = "gallo-atendimento-notify-prefs";

export const DEFAULT_NOTIFY_PREFS: IPwaNotifyPrefs = {
  push: true,
  waiting: true,
  inApp: true,
  sound: true,
  quiet: false,
};

function readPrefs(): IPwaNotifyPrefs {
  try {
    const raw = window.localStorage.getItem(PWA_NOTIFY_PREFS_KEY);
    if (!raw) return DEFAULT_NOTIFY_PREFS;
    const parsed = JSON.parse(raw) as Partial<IPwaNotifyPrefs>;
    // Merge over the defaults so a preference added later is not undefined for
    // someone who stored the old shape.
    return { ...DEFAULT_NOTIFY_PREFS, ...parsed };
  } catch {
    return DEFAULT_NOTIFY_PREFS;
  }
}

/** Per-device notification preferences. Local by design: they describe THIS
 *  phone's behaviour, not the account's. */
export function useNotificationPrefs() {
  const [prefs, setPrefsState] = useState<IPwaNotifyPrefs>(readPrefs);

  const setPrefs = useCallback((next: IPwaNotifyPrefs) => {
    setPrefsState(next);
    try {
      window.localStorage.setItem(PWA_NOTIFY_PREFS_KEY, JSON.stringify(next));
    } catch {
      /* private mode — preferences last for this session only */
    }
  }, []);

  const setPref = useCallback(
    <K extends keyof IPwaNotifyPrefs>(key: K, value: IPwaNotifyPrefs[K]) => {
      setPrefsState((current) => {
        const next = { ...current, [key]: value };
        try {
          window.localStorage.setItem(PWA_NOTIFY_PREFS_KEY, JSON.stringify(next));
        } catch {
          /* see above */
        }
        return next;
      });
    },
    [],
  );

  return { prefs, setPrefs, setPref };
}
