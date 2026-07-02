import { useEffect, useRef, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Icon } from "@/components/Icon";
import { useSoundAlertPreferencesStore } from "../store/soundAlertPreferencesStore";
import { createTonePlayer, type ToneKind } from "../lib/tonePlayer";

/** TopBar control: toggles the Inbox beeps on/off and adjusts the volume. */
export function SoundAlertToggle() {
  const [open, setOpen] = useState(false);
  const enabled = useSoundAlertPreferencesStore((s) => s.enabled);
  const volume = useSoundAlertPreferencesStore((s) => s.volume);
  const setEnabled = useSoundAlertPreferencesStore((s) => s.setEnabled);
  const setVolume = useSoundAlertPreferencesStore((s) => s.setVolume);

  const tonePlayerRef = useRef<ReturnType<typeof createTonePlayer> | null>(null);
  if (!tonePlayerRef.current) tonePlayerRef.current = createTonePlayer();

  // Close this toggle's own AudioContext on unmount so repeated
  // sign-out/sign-in cycles don't leak contexts past the browser's per-tab cap.
  useEffect(() => () => tonePlayerRef.current?.dispose(), []);

  const handleTest = (kind: ToneKind) => {
    tonePlayerRef.current?.unlock();
    tonePlayerRef.current?.play(kind, volume);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={enabled ? "Sons da Inbox ligados" : "Sons da Inbox desligados"}
          title="Sons da Inbox"
        >
          <Icon icon={enabled ? "mdi:volume-high" : "mdi:volume-off"} size={20} />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Sons da Inbox</p>
            <p className="text-xs text-muted-foreground">
              Beep ao chegar mensagem ou cliente novo na fila.
            </p>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} aria-label="Ativar sons da Inbox" />
        </div>

        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">Volume</p>
          <Slider
            value={[volume]}
            min={0}
            max={1}
            step={0.05}
            onValueChange={(v) => setVolume(v[0] ?? volume)}
            disabled={!enabled}
            aria-label="Volume dos sons"
          />
        </div>

        <div className="flex flex-col gap-2 border-t border-border pt-3">
          <Button
            variant="outline"
            size="sm"
            className="justify-start gap-2"
            disabled={!enabled}
            onClick={() => handleTest("assigned-mine")}
          >
            <Icon icon="mdi:message-outline" size={14} />
            Testar som: mensagem
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="justify-start gap-2"
            disabled={!enabled}
            onClick={() => handleTest("new-in-queue")}
          >
            <Icon icon="mdi:timer-sand" size={14} />
            Testar som: fila
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
