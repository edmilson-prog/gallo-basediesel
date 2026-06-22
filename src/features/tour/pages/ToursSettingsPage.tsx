// src/features/tour/pages/ToursSettingsPage.tsx
import { useReducer, useState } from "react";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { SettingsLayout } from "@/features/shell/layouts";
import { useAuth } from "@/features/auth/useAuth";
import { useTourStore } from "../store/useTourStore";
import { TOURS } from "../config/tours";
import { getOptOut, getSeen, resetAll, setOptOut } from "../storage/tourStorage";
import { TOUR_STRINGS as S } from "../i18n/pt-BR";

export function ToursSettingsPage() {
  const { currentUser } = useAuth();
  const userId = currentUser?.id ?? "";
  const start = useTourStore((s) => s.start);
  const [, force] = useReducer((x: number) => x + 1, 0);
  const [optOut, setOptOutState] = useState(() => getOptOut(userId));

  const seen = getSeen(userId);

  const replay = (key: string) => {
    const def = TOURS.find((t) => t.key === key);
    if (def && currentUser) start(def, currentUser.id);
  };
  const onReset = () => {
    resetAll(userId);
    force();
  };
  const toggleOptOut = () => {
    const next = !optOut;
    setOptOut(userId, next);
    setOptOutState(next);
  };

  return (
    <SettingsLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{S.settings.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{S.settings.subtitle}</p>
        </div>

        <div className="flex items-center justify-between rounded-lg border border-border bg-card p-4">
          <div>
            <p className="text-sm font-semibold">{S.settings.optOutLabel}</p>
            <p className="text-xs text-muted-foreground">
              {optOut ? S.settings.optOutOff : S.settings.optOutOn}
            </p>
          </div>
          <Button variant={optOut ? "default" : "outline"} size="sm" onClick={toggleOptOut}>
            {optOut ? S.settings.enable : S.settings.disable}
          </Button>
        </div>

        <div className="flex items-center justify-between rounded-lg border border-border bg-card p-4">
          <div>
            <p className="text-sm font-semibold">{S.settings.resetTitle}</p>
            <p className="text-xs text-muted-foreground">{S.settings.resetHint}</p>
          </div>
          <Button variant="outline" size="sm" onClick={onReset}>
            {S.settings.reset}
          </Button>
        </div>

        <div>
          <h2 className="mb-2 text-sm font-semibold text-foreground">{S.settings.listTitle}</h2>
          <ul className="divide-y divide-border rounded-lg border border-border bg-card">
            {TOURS.map((t) => (
              <li key={t.key} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <Icon
                    icon={t.steps[0]?.icon ?? "mdi:compass"}
                    size={18}
                    className="shrink-0 text-muted-foreground"
                  />
                  <span className="truncate text-sm">{t.label}</span>
                  <span
                    className={
                      seen.has(t.key)
                        ? "shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                        : "shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary"
                    }
                  >
                    {seen.has(t.key) ? S.settings.seen : S.settings.notSeen}
                  </span>
                </div>
                <Button variant="ghost" size="sm" onClick={() => replay(t.key)}>
                  {S.settings.replay}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </SettingsLayout>
  );
}
