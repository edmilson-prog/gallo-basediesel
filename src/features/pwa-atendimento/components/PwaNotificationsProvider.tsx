import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { useLocation } from "@tanstack/react-router";
import { useAuth } from "@/features/auth/useAuth";
import { PwaPushPrompt } from "./PwaPushPrompt";
import { PwaHeadsUp } from "./PwaHeadsUp";
import { PwaNotifySheet } from "./sheets/PwaNotifySheet";
import { useNotificationPrefs, type IPwaNotifyPrefs } from "../hooks/useNotificationPrefs";
import { useHeadsUpNotice } from "../hooks/useHeadsUpNotice";
import { usePushOptIn } from "../hooks/usePushOptIn";

interface IPwaNotificationsContext {
  permission: NotificationPermission;
  isSupported: boolean;
  prefs: IPwaNotifyPrefs;
  openPreferences: () => void;
}

const Ctx = createContext<IPwaNotificationsContext | null>(null);

/** Read the notification state from anywhere inside the app (the account
 *  sheet shows it and links into the preferences). */
export function usePwaNotifications(): IPwaNotificationsContext {
  const value = useContext(Ctx);
  if (!value) {
    throw new Error("usePwaNotifications must be used inside <PwaNotificationsProvider>");
  }
  return value;
}

/** `/atendimento/conversa/<id>` → `<id>`; null on every other screen. */
function activeConversationIdFrom(pathname: string): string | null {
  const match = /^\/atendimento\/conversa\/([^/]+)/.exec(pathname);
  return match?.[1] ?? null;
}

/**
 * Owns everything notification-shaped: the per-device preferences, the soft
 * ask, the in-app band and the preferences sheet.
 *
 * It lives in the shell so the band survives navigation between the list and a
 * thread, and so the soft ask has one home instead of one per screen.
 */
export function PwaNotificationsProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const { pathname } = useLocation();
  const { prefs, setPref } = useNotificationPrefs();
  const [sheetOpen, setSheetOpen] = useState(false);

  // The ask belongs to the signed-in app, never to login or the install screen.
  const inApp =
    isAuthenticated &&
    !pathname.startsWith("/atendimento/entrar") &&
    !pathname.startsWith("/atendimento/instalar");

  const push = usePushOptIn({ active: inApp });
  const activeConversationId = activeConversationIdFrom(pathname);
  const headsUp = useHeadsUpNotice({
    activeConversationId,
    enabled: inApp && prefs.inApp,
  });

  const value = useMemo<IPwaNotificationsContext>(
    () => ({
      permission: push.permission,
      isSupported: push.isSupported,
      prefs,
      openPreferences: () => setSheetOpen(true),
    }),
    [push.permission, push.isSupported, prefs],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      <PwaHeadsUp notice={headsUp.notice} onDismiss={headsUp.dismiss} />
      <PwaPushPrompt
        open={push.offering}
        onAllow={() => void push.allow()}
        onLater={push.decline}
      />
      <PwaNotifySheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        permission={push.permission}
        isSupported={push.isSupported}
        prefs={prefs}
        onChange={setPref}
        onRequestPermission={() => void push.subscribe()}
      />
    </Ctx.Provider>
  );
}
