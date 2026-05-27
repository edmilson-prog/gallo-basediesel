import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { IBadgeDefinition, IGamificationRules } from "@/shared/types";
import { useCurrentStore } from "@/features/multistore";
import { useQueryClient } from "@tanstack/react-query";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { SectionHeader } from "@/features/admin-settings/components/SectionHeader";
import { usePlatformSettings } from "@/features/admin-settings/hooks/usePlatformSettings";
import { BadgeChip } from "../components/BadgeChip";
import { RarityBadge } from "../components/RarityBadge";
import { GAMIFICATION_STRINGS as S } from "../i18n/pt-BR";

type RulesDraft = Pick<
  IGamificationRules,
  | "active"
  | "pointsPerGoalCompleted"
  | "pointsPerGoalExceeded"
  | "pointsPerNewCustomer"
  | "pointsPerPositivation"
  | "pointsPerRecovery"
  | "pointsPerHighTicketOrder"
  | "thresholdHighTicket"
  | "thresholdBigTicket"
  | "notifyOnBadgeEarned"
>;

function pickDraft(rules: IGamificationRules): RulesDraft {
  return {
    active: rules.active,
    pointsPerGoalCompleted: rules.pointsPerGoalCompleted,
    pointsPerGoalExceeded: rules.pointsPerGoalExceeded,
    pointsPerNewCustomer: rules.pointsPerNewCustomer,
    pointsPerPositivation: rules.pointsPerPositivation,
    pointsPerRecovery: rules.pointsPerRecovery,
    pointsPerHighTicketOrder: rules.pointsPerHighTicketOrder,
    thresholdHighTicket: rules.thresholdHighTicket,
    thresholdBigTicket: rules.thresholdBigTicket,
    notifyOnBadgeEarned: rules.notifyOnBadgeEarned,
  };
}

function makeBadgeKey(slug: string): string {
  return slug;
}

interface IFieldRowProps {
  label: string;
  value: number;
  step?: number;
  onChange: (v: number) => void;
  suffix?: string;
}

function FieldRow({ label, value, step = 1, onChange, suffix }: IFieldRowProps) {
  return (
    <label className="flex items-center justify-between gap-4 py-2">
      <span className="text-sm text-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="h-9 w-28 text-right tabular-nums"
        />
        {suffix && <span className="text-xs text-muted-foreground">{suffix}</span>}
      </div>
    </label>
  );
}

/**
 * Configuration page (`/app/configuracoes/gamificacao`) — PRD-043 Phase 3.
 *
 * Replaces the placeholder. Owner only. Edits `IGamificationRules` and the
 * badge catalog (toggle + bonus points). Writes audit log via the shared
 * settings update hook.
 */
export function GamificationConfigPage() {
  const { currentStoreId } = useCurrentStore();
  const storeId = currentStoreId ?? "store-matriz";
  const { settings, loading, saving, update } = usePlatformSettings(storeId);
  const queryClient = useQueryClient();

  const [draft, setDraft] = useState<RulesDraft | null>(null);
  const [badgesDraft, setBadgesDraft] = useState<IBadgeDefinition[]>([]);

  useEffect(() => {
    if (!settings) return;
    setDraft(pickDraft(settings.gamificationRules));
    setBadgesDraft(settings.gamificationRules.badges);
  }, [settings]);

  const dirty = useMemo(() => {
    if (!settings || !draft) return false;
    const base = pickDraft(settings.gamificationRules);
    if (JSON.stringify(base) !== JSON.stringify(draft)) return true;
    const baseBadges = settings.gamificationRules.badges;
    if (baseBadges.length !== badgesDraft.length) return true;
    for (let i = 0; i < baseBadges.length; i += 1) {
      const a = baseBadges[i];
      const b = badgesDraft[i];
      if (a.slug !== b.slug || a.active !== b.active || a.bonusPoints !== b.bonusPoints) {
        return true;
      }
    }
    return false;
  }, [settings, draft, badgesDraft]);

  if (loading || !settings || !draft) {
    return (
      <div className="space-y-6">
        <SectionHeader title={S.configTitle} description={S.configSubtitle} />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  const handleSave = async () => {
    try {
      const nextRules: IGamificationRules = {
        ...settings.gamificationRules,
        ...draft,
        badges: badgesDraft,
      };
      await update({ gamificationRules: nextRules }, "settings.gamification.update");
      void queryClient.invalidateQueries({ queryKey: ["gamification"] });
      toast.success("Configurações salvas", { icon: <Icon icon="mdi:check" size={16} /> });
    } catch {
      toast.error("Não foi possível salvar.");
    }
  };

  const handleReset = () => {
    setDraft(pickDraft(settings.gamificationRules));
    setBadgesDraft(settings.gamificationRules.badges);
  };

  const handleRecalc = () => {
    void queryClient.invalidateQueries({ queryKey: ["gamification"] });
    toast.success("Ranking recalculado.", {
      icon: <Icon icon="mdi:refresh" size={16} />,
    });
  };

  const toggleBadge = (slug: string) => {
    setBadgesDraft((curr) => curr.map((b) => (b.slug === slug ? { ...b, active: !b.active } : b)));
  };

  const editBadgePoints = (slug: string, points: number) => {
    setBadgesDraft((curr) =>
      curr.map((b) => (b.slug === slug ? { ...b, bonusPoints: points } : b)),
    );
  };

  return (
    <div className="space-y-6">
      <SectionHeader title={S.configTitle} description={S.configSubtitle} />

      <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-xs text-foreground">
        <Icon icon="mdi:information-outline" size={14} className="mr-1 inline align-text-bottom" />
        {S.configDemoBanner}
      </div>

      {/* Global toggle */}
      <Card className="flex items-start justify-between gap-4 p-5">
        <div>
          <p className="text-sm font-semibold text-foreground">{S.configToggleActive}</p>
          <p className="mt-1 text-xs text-muted-foreground">{S.configToggleDescription}</p>
        </div>
        <Switch checked={draft.active} onCheckedChange={(v) => setDraft({ ...draft, active: v })} />
      </Card>

      {/* Rules block */}
      <Card className="p-5">
        <h2 className="text-base font-semibold text-foreground">{S.configRulesTitle}</h2>
        <div className="mt-3 divide-y divide-border">
          <FieldRow
            label={S.configPointsGoalCompleted}
            value={draft.pointsPerGoalCompleted}
            onChange={(v) => setDraft({ ...draft, pointsPerGoalCompleted: v })}
            suffix="pts"
          />
          <FieldRow
            label={S.configPointsGoalExceeded}
            value={draft.pointsPerGoalExceeded}
            onChange={(v) => setDraft({ ...draft, pointsPerGoalExceeded: v })}
            suffix="pts"
          />
          <FieldRow
            label={S.configPointsNewCustomer}
            value={draft.pointsPerNewCustomer}
            onChange={(v) => setDraft({ ...draft, pointsPerNewCustomer: v })}
            suffix="pts"
          />
          <FieldRow
            label={S.configPointsPositivation}
            value={draft.pointsPerPositivation}
            onChange={(v) => setDraft({ ...draft, pointsPerPositivation: v })}
            suffix="pts"
          />
          <FieldRow
            label={S.configPointsRecovery}
            value={draft.pointsPerRecovery}
            onChange={(v) => setDraft({ ...draft, pointsPerRecovery: v })}
            suffix="pts"
          />
          <FieldRow
            label={S.configPointsHighTicket}
            value={draft.pointsPerHighTicketOrder}
            onChange={(v) => setDraft({ ...draft, pointsPerHighTicketOrder: v })}
            suffix="pts"
          />
          <FieldRow
            label={S.configThresholdHighTicket}
            value={draft.thresholdHighTicket}
            step={100}
            onChange={(v) => setDraft({ ...draft, thresholdHighTicket: v })}
            suffix="R$"
          />
          <FieldRow
            label={S.configThresholdBigTicket}
            value={draft.thresholdBigTicket}
            step={500}
            onChange={(v) => setDraft({ ...draft, thresholdBigTicket: v })}
            suffix="R$"
          />
        </div>
        <label className="mt-4 flex items-center justify-between gap-4 border-t border-border pt-3">
          <span className="text-sm text-foreground">{S.configNotifyOnBadgeEarned}</span>
          <Switch
            checked={draft.notifyOnBadgeEarned}
            onCheckedChange={(v) => setDraft({ ...draft, notifyOnBadgeEarned: v })}
          />
        </label>
      </Card>

      {/* Badges catalog */}
      <Card className="p-5">
        <h2 className="text-base font-semibold text-foreground">{S.configBadgesTitle}</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <tbody>
              {badgesDraft.map((badge) => (
                <tr
                  key={makeBadgeKey(badge.slug)}
                  className="border-b border-border/50 last:border-0"
                >
                  <td className="py-3 pr-3">
                    <BadgeChip definition={badge} size={20} outlined withTooltip={false} />
                  </td>
                  <td className="py-3 pr-3">
                    <div className="flex flex-col">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-foreground">{badge.name}</span>
                        <RarityBadge rarity={badge.rarity} />
                      </div>
                      <span className="text-xs text-muted-foreground">{badge.description}</span>
                    </div>
                  </td>
                  <td className="py-3 pr-3">
                    <Input
                      type="number"
                      step={10}
                      value={badge.bonusPoints}
                      onChange={(e) => editBadgePoints(badge.slug, Number(e.target.value))}
                      className="h-8 w-24 text-right tabular-nums"
                    />
                  </td>
                  <td className="py-3 text-right">
                    <Switch
                      checked={badge.active}
                      onCheckedChange={() => toggleBadge(badge.slug)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Footer actions */}
      <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
        <Button type="button" variant="outline" onClick={handleRecalc}>
          <Icon icon="mdi:refresh" size={16} />
          <span className="ml-1.5">{S.configRecalcButton}</span>
        </Button>
        <Button type="button" variant="ghost" onClick={handleReset} disabled={!dirty || saving}>
          Descartar
        </Button>
        <Button type="button" onClick={handleSave} disabled={!dirty || saving}>
          {saving ? "Salvando…" : S.configSaveButton}
        </Button>
      </div>
    </div>
  );
}
