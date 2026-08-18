import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DEFAULT_INBOUND_TOAST_SETTINGS,
  DEFAULT_SOUND_SETTINGS,
  INBOUND_TOAST_DURATION_MAX_SECONDS,
  INBOUND_TOAST_DURATION_MIN_SECONDS,
  type IInboundToastSettings,
  type ISoundSettings,
  type SoundEventId,
  type SoundTemplateId,
} from "@/shared/types";
import { useCurrentStore } from "@/features/multistore";
import { SectionHeader } from "@/features/admin-settings/components/SectionHeader";
import { usePlatformSettings } from "@/features/admin-settings/hooks/usePlatformSettings";
import { SOUND_EVENTS } from "../engine/soundEvents";
import { SOUND_TEMPLATE_LIST } from "../engine/soundTemplates";
import { createSoundPlayer, type ISoundPlayer } from "../lib/soundPlayer";
import { SOUND_SETTINGS_I18N as T } from "../i18n/pt-BR";

const DEFAULT_STORE_ID = "00000000-0000-0000-0000-000000000001";

export function SoundSettingsPage() {
  const { currentStoreId } = useCurrentStore();
  const storeId = currentStoreId ?? DEFAULT_STORE_ID;
  const { settings, loading, saving, update } = usePlatformSettings(storeId);
  const queryClient = useQueryClient();

  const [draft, setDraft] = useState<ISoundSettings>(DEFAULT_SOUND_SETTINGS);
  const [toastDraft, setToastDraft] = useState<IInboundToastSettings>(
    DEFAULT_INBOUND_TOAST_SETTINGS,
  );

  const playerRef = useRef<ISoundPlayer | null>(null);
  if (!playerRef.current) playerRef.current = createSoundPlayer();
  useEffect(() => () => playerRef.current?.dispose(), []);

  useEffect(() => {
    if (!settings) return;
    setDraft(settings.sound ?? DEFAULT_SOUND_SETTINGS);
    setToastDraft(settings.inboundToast ?? DEFAULT_INBOUND_TOAST_SETTINGS);
  }, [settings]);

  const dirty = useMemo(() => {
    if (!settings) return false;
    const current = settings.sound ?? DEFAULT_SOUND_SETTINGS;
    const currentToast = settings.inboundToast ?? DEFAULT_INBOUND_TOAST_SETTINGS;
    return (
      JSON.stringify(current) !== JSON.stringify(draft) ||
      JSON.stringify(currentToast) !== JSON.stringify(toastDraft)
    );
  }, [settings, draft, toastDraft]);

  const patchEvent = (id: SoundEventId, p: Partial<ISoundSettings["events"][SoundEventId]>) =>
    setDraft((d) => ({ events: { ...d.events, [id]: { ...d.events[id], ...p } } }));

  const handleTest = (id: SoundEventId) => {
    const cfg = draft.events[id];
    playerRef.current?.unlock();
    playerRef.current?.playTemplate(cfg.templateId, cfg.volume);
  };

  const handleSave = async () => {
    try {
      await update({ sound: draft, inboundToast: toastDraft }, "settings.sound.update");
      await queryClient.invalidateQueries({ queryKey: ["settings", storeId] });
      toast.success(T.saved, { icon: <Icon icon="mdi:check" size={16} /> });
    } catch {
      toast.error(T.saveError);
    }
  };

  const handleReset = () => {
    if (!settings) return;
    setDraft(settings.sound ?? DEFAULT_SOUND_SETTINGS);
    setToastDraft(settings.inboundToast ?? DEFAULT_INBOUND_TOAST_SETTINGS);
  };

  if (loading || !settings) {
    return (
      <div className="space-y-6">
        <SectionHeader title={T.title} description={T.description} />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SectionHeader title={T.title} description={T.description} />

      <div className="space-y-4 rounded-lg border border-border bg-card p-6">
        {SOUND_EVENTS.map((event) => {
          const cfg = draft.events[event.id];
          return (
            <div key={event.id} className="space-y-3 rounded-md border border-border/60 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">{event.label}</p>
                  <p className="text-xs text-muted-foreground">{event.description}</p>
                </div>
                <Switch
                  checked={cfg.enabled}
                  onCheckedChange={(v) => patchEvent(event.id, { enabled: v })}
                  aria-label={T.enabledAria(event.label)}
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">{T.templateLabel}</Label>
                  <Select
                    value={cfg.templateId}
                    onValueChange={(v) =>
                      patchEvent(event.id, { templateId: v as SoundTemplateId })
                    }
                    disabled={!cfg.enabled}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SOUND_TEMPLATE_LIST.map((tpl) => (
                        <SelectItem key={tpl.id} value={tpl.id}>
                          {tpl.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleTest(event.id)}
                  disabled={!cfg.enabled}
                  className="gap-1"
                >
                  <Icon icon="mdi:play" size={14} />
                  {T.test}
                </Button>
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">{T.volumeLabel}</Label>
                <Slider
                  value={[cfg.volume]}
                  min={0}
                  max={1}
                  step={0.05}
                  onValueChange={(v) => patchEvent(event.id, { volume: v[0] ?? cfg.volume })}
                  disabled={!cfg.enabled}
                  aria-label={`${T.volumeLabel}: ${event.label}`}
                />
              </div>

              {/* The on-screen alert exists only for this event, and is NOT
                  gated by `cfg.enabled` — sound and alert are independent by
                  design, so the store can keep one without the other. */}
              {event.id === "inboxAssignedMine" && (
                <div className="space-y-3 border-t border-border/60 pt-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">{T.toastTitle}</p>
                      <p className="text-xs text-muted-foreground">{T.toastDescription}</p>
                    </div>
                    <Switch
                      checked={toastDraft.enabled}
                      onCheckedChange={(v) => setToastDraft((d) => ({ ...d, enabled: v }))}
                      aria-label={T.toastEnabledAria}
                    />
                  </div>

                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <Label className="text-xs text-muted-foreground">{T.toastPreviewLabel}</Label>
                      <p className="text-xs text-muted-foreground">{T.toastPreviewHint}</p>
                    </div>
                    <Switch
                      checked={toastDraft.showPreview}
                      onCheckedChange={(v) => setToastDraft((d) => ({ ...d, showPreview: v }))}
                      disabled={!toastDraft.enabled}
                      aria-label={T.toastPreviewAria}
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">
                      {T.toastDurationLabel(toastDraft.durationSeconds)}
                    </Label>
                    <Slider
                      value={[toastDraft.durationSeconds]}
                      min={INBOUND_TOAST_DURATION_MIN_SECONDS}
                      max={INBOUND_TOAST_DURATION_MAX_SECONDS}
                      step={1}
                      onValueChange={(v) =>
                        setToastDraft((d) => ({
                          ...d,
                          durationSeconds: v[0] ?? d.durationSeconds,
                        }))
                      }
                      disabled={!toastDraft.enabled}
                      aria-label={T.toastDurationAria}
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}

        <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
          <Button variant="outline" onClick={handleReset} disabled={!dirty || saving}>
            {T.discard}
          </Button>
          <Button onClick={handleSave} disabled={!dirty || saving}>
            {saving ? T.saving : T.save}
          </Button>
        </div>
      </div>
    </div>
  );
}
