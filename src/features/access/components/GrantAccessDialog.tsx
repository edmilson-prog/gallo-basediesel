import { useState } from "react";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Icon } from "@/components/Icon";
import type { ISeller } from "@/shared/types";
import { useSellersProvider, recordAuditLogSync } from "@/providers/data";
import { useAuth } from "@/features/auth/useAuth";

/** Brasília offset is fixed at UTC−03:00 (no DST since 2019). */
const SP_OFFSET_MINUTES = 180;

/** Hour presets for the "by N hours" mode. */
const HOUR_OPTIONS = [1, 2, 4, 8] as const;

type GrantMode = "hours" | "until";

interface IGrantAccessDialogProps {
  target: ISeller;
  storeId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** YYYY-MM-DD for "today" in the Brasília timezone. */
function brasiliaTodayYmd(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/**
 * Builds the expiry instant from the chosen mode. Returns `null` when the
 * "until" time is malformed (caller surfaces an inline error).
 */
function resolveExpiresAt(mode: GrantMode, hours: number, time: string): string | null {
  if (mode === "hours") {
    return new Date(Date.now() + hours * 3_600_000).toISOString();
  }

  if (!time) return null;
  const ymdParts = brasiliaTodayYmd().split("-");
  const y = Number(ymdParts[0]);
  const m = Number(ymdParts[1]);
  const d = Number(ymdParts[2]);
  const timeParts = time.split(":");
  const hh = Number(timeParts[0]);
  const mm = Number(timeParts[1]);
  if ([y, m, d, hh, mm].some((n) => Number.isNaN(n))) return null;

  // Interpret HH:mm as a Brasília wall-clock time, then convert to UTC.
  return new Date(Date.UTC(y, m - 1, d, hh, mm) + SP_OFFSET_MINUTES * 60_000).toISOString();
}

/**
 * Owner-only dialog to grant a temporary emergency access (PRD-212 RF-013/014).
 * The grant unlocks login outside the work schedule until `expiresAt`. Creation
 * is audited (`access_grant_created`) and the seller caches are invalidated.
 *
 * Lives inside the parent "Geral" form, so all buttons are `type="button"`.
 */
export function GrantAccessDialog({ target, storeId, open, onOpenChange }: IGrantAccessDialogProps) {
  const provider = useSellersProvider();
  const { currentUser } = useAuth();
  const queryClient = useQueryClient();

  const [mode, setMode] = useState<GrantMode>("hours");
  const [hours, setHours] = useState<number>(2);
  const [time, setTime] = useState<string>("");
  const [reason, setReason] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const resetForm = () => {
    setMode("hours");
    setHours(2);
    setTime("");
    setReason("");
    setError(null);
  };

  const mutation = useMutation({
    mutationFn: async (expiresAt: string) => {
      const grant = {
        grantedBy: currentUser?.sellerId ?? currentUser?.id ?? "system",
        grantedAt: new Date().toISOString(),
        expiresAt,
        reason: reason.trim() || undefined,
      };
      const saved = await provider.update(target.id, { accessGrant: grant });
      recordAuditLogSync({
        storeId,
        actorId: currentUser?.sellerId ?? currentUser?.id ?? "system",
        action: "access_grant_created",
        resource: "seller",
        resourceId: target.id,
        after: { expiresAt, reason: reason.trim() || null },
      });
      return saved;
    },
    onSuccess: async () => {
      toast.success("Liberação de acesso concedida.");
      await queryClient.invalidateQueries({ queryKey: ["sellers", storeId] });
      await queryClient.invalidateQueries({ queryKey: ["seller"] });
      resetForm();
      onOpenChange(false);
    },
    onError: (err: Error) =>
      toast.error("Não foi possível conceder a liberação.", { description: err.message }),
  });

  const handleConfirm = () => {
    setError(null);
    const expiresAt = resolveExpiresAt(mode, hours, time);
    if (!expiresAt) {
      setError("Informe um horário válido.");
      return;
    }
    if (Date.parse(expiresAt) <= Date.now()) {
      setError("O horário escolhido já passou. Escolha um instante futuro.");
      return;
    }
    mutation.mutate(expiresAt);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setError(null);
        }
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Liberar acesso temporário</DialogTitle>
          <DialogDescription>
            Concede a {target.fullName} um acesso de emergência que ignora o horário de
            atendimento até expirar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <RadioGroup
            value={mode}
            onValueChange={(value) => {
              setMode(value as GrantMode);
              setError(null);
            }}
            className="gap-3"
          >
            <div className="flex items-center gap-3">
              <RadioGroupItem value="hours" id="grant-mode-hours" />
              <Label htmlFor="grant-mode-hours" className="font-normal">
                Por um período a partir de agora
              </Label>
            </div>
            {mode === "hours" && (
              <div className="pl-7">
                <Select
                  value={String(hours)}
                  onValueChange={(value) => setHours(Number(value))}
                >
                  <SelectTrigger className="h-9 w-40" aria-label="Duração da liberação">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {HOUR_OPTIONS.map((h) => (
                      <SelectItem key={h} value={String(h)}>
                        {h} {h === 1 ? "hora" : "horas"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="flex items-center gap-3">
              <RadioGroupItem value="until" id="grant-mode-until" />
              <Label htmlFor="grant-mode-until" className="font-normal">
                Até um horário de hoje
              </Label>
            </div>
            {mode === "until" && (
              <div className="pl-7">
                <Input
                  type="time"
                  value={time}
                  onChange={(e) => {
                    setTime(e.target.value);
                    setError(null);
                  }}
                  className="h-9 w-36"
                  aria-label="Horário de expiração (fuso de Brasília)"
                />
                <p className="mt-1 text-xs text-muted-foreground">Fuso de Brasília.</p>
              </div>
            )}
          </RadioGroup>

          <div className="space-y-1.5">
            <Label htmlFor="grant-reason" className="font-normal">
              Motivo (opcional)
            </Label>
            <Input
              id="grant-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex.: plantão de fim de semana"
              className="h-9"
            />
          </div>

          {error && (
            <p className="flex items-start gap-1.5 text-sm text-severity-critical">
              <Icon icon="mdi:alert-circle-outline" size={14} className="mt-0.5 shrink-0" />
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={mutation.isPending}
          >
            Cancelar
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={mutation.isPending}>
            {mutation.isPending ? "Concedendo…" : "Conceder liberação"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
