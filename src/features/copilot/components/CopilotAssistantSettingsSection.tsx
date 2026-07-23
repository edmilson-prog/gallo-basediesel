import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type {
  CopilotReach,
  CopilotTrigger,
  ICopilotAssistantSettings,
  ID,
  RoleName,
} from "@/shared/types";
import { useWhatsAppAccountsProvider } from "@/providers/data";
import { useCopilotAssistantSettings } from "../hooks/useCopilotAssistantSettings";
import { estimateAssistantCost } from "../engine/estimateAssistantCost";
import { COPILOT_STRINGS } from "../i18n/pt-BR";
import { CopilotPlacementField } from "./CopilotPlacementField";

/** Measured in production on 2026-07-22 — see the audit in the spec. */
const ACTIVE_CONVERSATIONS_PER_DAY = 194;
const COST_PER_CALL_BRL = 0.025;
const OPENS_PER_CONVERSATION_PER_DAY = 5;

const REACHES: CopilotReach[] = ["all", "customer_only", "lead_only"];
const TRIGGERS: CopilotTrigger[] = ["on_demand", "on_open", "on_new_message"];
const SELECTABLE_ROLES: RoleName[] = ["Owner", "Gestor", "Vendedor", "SDR", "VendedorExterno"];

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function CopilotAssistantSettingsSection({ storeId }: { storeId: ID | null }) {
  const S = COPILOT_STRINGS.settings;
  const { settings, loading, saving, update } = useCopilotAssistantSettings(storeId);
  const accountsProvider = useWhatsAppAccountsProvider();
  const [draft, setDraft] = useState<ICopilotAssistantSettings>(settings);
  const [accounts, setAccounts] = useState<Array<{ id: ID; label: string }>>([]);

  useEffect(() => setDraft(settings), [settings]);

  useEffect(() => {
    if (!storeId) return;
    let cancelled = false;
    // `list()` returns `IWhatsAppAccount[]` directly (not a paginated result),
    // and excludes WAHA on purpose. If the store uses WAHA numbers, list them
    // too via `listWaha` and merge — see the provider contract. Here we keep it
    // to `list()`; extend if a WAHA account must be selectable.
    void accountsProvider
      .list({ storeId })
      .then((rows) => {
        if (!cancelled) setAccounts(rows.map((a) => ({ id: a.id, label: a.label })));
      })
      .catch(() => {
        /* the account filter degrades to "todos" when the list fails */
      });
    return () => {
      cancelled = true;
    };
  }, [accountsProvider, storeId]);

  const estimate = estimateAssistantCost({
    settings: draft,
    activeConversationsPerDay: ACTIVE_CONVERSATIONS_PER_DAY,
    costPerCallBRL: COST_PER_CALL_BRL,
    opensPerConversationPerDay: OPENS_PER_CONVERSATION_PER_DAY,
  });

  const toggleIn = <T,>(list: T[], value: T): T[] =>
    list.includes(value) ? list.filter((x) => x !== value) : [...list, value];

  const handleSave = async () => {
    try {
      await update({
        ...draft,
        cacheMinutes: clampInt(draft.cacheMinutes, 0, 1440),
        minNewMessages: clampInt(draft.minNewMessages, 1, 50),
        messageWindow: clampInt(draft.messageWindow, 5, 200),
        monthlyCapBRL: Math.max(0, draft.monthlyCapBRL),
        alertThresholdPct: clampInt(draft.alertThresholdPct, 1, 100),
      });
      toast.success(S.saved);
    } catch {
      toast.error(S.saveFailed);
    }
  };

  if (loading) return null;

  return (
    <div className="space-y-4">
      {/* Ativação e alcance */}
      <section className="rounded-lg border border-border bg-card p-4 space-y-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {S.groups.reach}
        </h3>

        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm text-foreground">{S.enabled}</p>
            <p className="text-xs text-muted-foreground">{S.enabledHint}</p>
          </div>
          <Switch
            checked={draft.enabled}
            onCheckedChange={(v) => setDraft((d) => ({ ...d, enabled: v }))}
            aria-label={S.enabled}
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">{S.reachLabel}</Label>
          <div className="flex flex-wrap gap-2">
            {REACHES.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setDraft((d) => ({ ...d, reach: r }))}
                aria-pressed={draft.reach === r}
                className={
                  draft.reach === r
                    ? "cursor-pointer rounded-md border border-primary/50 bg-primary/15 px-3 py-1.5 text-xs font-semibold text-foreground"
                    : "cursor-pointer rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
                }
              >
                {S.reachOptions[r]}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">{S.accountsLabel}</Label>
          <p className="text-xs text-muted-foreground">{S.accountsHint}</p>
          <div className="flex flex-wrap gap-2">
            {accounts.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => setDraft((d) => ({ ...d, accountIds: toggleIn(d.accountIds, a.id) }))}
                aria-pressed={draft.accountIds.includes(a.id)}
                className={
                  draft.accountIds.includes(a.id)
                    ? "cursor-pointer rounded-full border border-primary/50 bg-primary/15 px-3 py-1 text-xs text-foreground"
                    : "cursor-pointer rounded-full border border-border px-3 py-1 text-xs text-muted-foreground hover:text-foreground"
                }
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">{S.rolesLabel}</Label>
          <p className="text-xs text-muted-foreground">{S.rolesHint}</p>
          <div className="flex flex-wrap gap-2">
            {SELECTABLE_ROLES.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setDraft((d) => ({ ...d, roles: toggleIn(d.roles, r) }))}
                aria-pressed={draft.roles.includes(r)}
                className={
                  draft.roles.includes(r)
                    ? "cursor-pointer rounded-full border border-primary/50 bg-primary/15 px-3 py-1 text-xs text-foreground"
                    : "cursor-pointer rounded-full border border-border px-3 py-1 text-xs text-muted-foreground hover:text-foreground"
                }
              >
                {r}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Quando analisar */}
      <section className="rounded-lg border border-border bg-card p-4 space-y-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {S.groups.timing}
        </h3>

        <div className="space-y-1.5">
          <Label className="text-xs">{S.triggerLabel}</Label>
          <div className="flex flex-wrap gap-2">
            {TRIGGERS.map((t) => (
              <button
                key={t}
                type="button"
                disabled={draft.engine !== "ai"}
                onClick={() => setDraft((d) => ({ ...d, trigger: t }))}
                aria-pressed={draft.trigger === t}
                className={
                  draft.trigger === t
                    ? "cursor-pointer rounded-md border border-primary/50 bg-primary/15 px-3 py-1.5 text-xs font-semibold text-foreground disabled:opacity-50"
                    : "cursor-pointer rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
                }
              >
                {S.triggerOptions[t]}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="copilot-cache" className="text-xs">{S.cacheMinutesLabel}</Label>
            <Input
              id="copilot-cache"
              type="number"
              min={0}
              max={1440}
              disabled={draft.engine !== "ai"}
              value={draft.cacheMinutes}
              onChange={(e) => setDraft((d) => ({ ...d, cacheMinutes: Number(e.target.value) }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="copilot-minnew" className="text-xs">{S.minNewMessagesLabel}</Label>
            <Input
              id="copilot-minnew"
              type="number"
              min={1}
              max={50}
              disabled={draft.engine !== "ai"}
              value={draft.minNewMessages}
              onChange={(e) => setDraft((d) => ({ ...d, minNewMessages: Number(e.target.value) }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="copilot-window" className="text-xs">{S.messageWindowLabel}</Label>
            <Input
              id="copilot-window"
              type="number"
              min={5}
              max={200}
              value={draft.messageWindow}
              onChange={(e) => setDraft((d) => ({ ...d, messageWindow: Number(e.target.value) }))}
            />
            <p className="text-xs text-muted-foreground">{S.messageWindowHint}</p>
          </div>
        </div>
      </section>

      {/* O que o painel mostra */}
      <section className="rounded-lg border border-border bg-card p-4 space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {S.groups.display}
        </h3>
        {(
          [
            ["showSummary", S.showSummary],
            ["showSuggestions", S.showSuggestions],
            ["showReplyButton", S.showReplyButton],
            ["autoExpandOnAlert", S.autoExpandOnAlert],
          ] as const
        ).map(([field, label]) => (
          <div key={field} className="flex items-center justify-between gap-4">
            <p className="text-sm text-foreground">{label}</p>
            <Switch
              checked={draft[field]}
              onCheckedChange={(v) => setDraft((d) => ({ ...d, [field]: v }))}
              aria-label={label}
            />
          </div>
        ))}
        <div className="border-t border-border pt-3">
          <div className="mb-1.5 flex items-center gap-2">
            <Label className="text-xs">{S.placementLabel}</Label>
            <span className="rounded-md border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {S.placementPersonal}
            </span>
          </div>
          <p className="mb-2 text-xs text-muted-foreground">{S.placementPersonalHint}</p>
          <CopilotPlacementField />
        </div>
      </section>

      {/* Motor */}
      <section className="rounded-lg border border-border bg-card p-4 space-y-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {S.groups.engine}
        </h3>

        <div className="space-y-1.5">
          <Label className="text-xs">{S.engineLabel}</Label>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setDraft((d) => ({ ...d, engine: "rules" }))}
              aria-pressed={draft.engine === "rules"}
              className={
                draft.engine === "rules"
                  ? "cursor-pointer rounded-md border border-primary/50 bg-primary/15 px-3 py-1.5 text-xs font-semibold text-foreground"
                  : "cursor-pointer rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
              }
            >
              {S.engineOptions.rules}
            </button>
            <button
              type="button"
              disabled
              title={S.engineAiLocked}
              className="cursor-not-allowed rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground opacity-60"
            >
              {S.engineOptions.ai}
            </button>
            <span className="text-xs text-muted-foreground">{S.engineAiLocked}</span>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="copilot-cap" className="text-xs">{S.monthlyCapLabel}</Label>
            <Input
              id="copilot-cap"
              type="number"
              min={0}
              step="10"
              value={draft.monthlyCapBRL}
              onChange={(e) => setDraft((d) => ({ ...d, monthlyCapBRL: Number(e.target.value) }))}
            />
            <p className="text-xs text-muted-foreground">{S.monthlyCapHint}</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="copilot-threshold" className="text-xs">{S.alertThresholdLabel}</Label>
            <Input
              id="copilot-threshold"
              type="number"
              min={1}
              max={100}
              value={draft.alertThresholdPct}
              onChange={(e) =>
                setDraft((d) => ({ ...d, alertThresholdPct: Number(e.target.value) }))
              }
            />
          </div>
        </div>
      </section>

      {/* Estimativa viva */}
      <section className="rounded-lg border border-warning/40 bg-warning/5 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {S.estimateTitle}
        </p>
        {draft.engine === "rules" ? (
          <p className="mt-2 text-sm text-foreground">{S.estimateFree}</p>
        ) : (
          <>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-warning">
              ~R$ {estimate.monthlyBRL.toFixed(2).replace(".", ",")}/mês
            </p>
            {draft.monthlyCapBRL > 0 && (
              <p className="text-xs tabular-nums text-muted-foreground">
                {S.estimateOfCap(estimate.pctOfCap)}
              </p>
            )}
          </>
        )}
        <p className="mt-2 text-xs text-muted-foreground">{S.estimateAssumption}</p>
      </section>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {S.save}
        </Button>
      </div>
    </div>
  );
}
