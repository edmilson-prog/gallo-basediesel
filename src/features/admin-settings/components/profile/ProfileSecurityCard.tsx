import { useState } from "react";
import { toast } from "sonner";
import { Icon } from "@/components/Icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { useTwoFactor } from "../../hooks/useTwoFactor";
import { TwoFactorSetupDialog } from "./TwoFactorSetupDialog";
import {
  MIN_PASSWORD_LENGTH,
  PASSWORD_STRENGTH_BARS,
  type PasswordStrengthTone,
  evaluatePassword,
  validatePasswordChange,
} from "../../engine/passwordStrength";
import { ProfileField } from "./ProfileField";
import { ProfileSectionCard } from "./ProfileSectionCard";
import { ProfileSettingRow } from "./ProfileSettingRow";

const STRENGTH_BAR_CLASS: Record<PasswordStrengthTone, string> = {
  muted: "bg-muted",
  critical: "bg-severity-critical",
  warning: "bg-severity-warning",
  success: "bg-severity-success",
};

const STRENGTH_TEXT_CLASS: Record<PasswordStrengthTone, string> = {
  muted: "text-muted-foreground",
  critical: "text-severity-critical",
  warning: "text-severity-warning",
  success: "text-severity-success",
};

const EMPTY_DRAFT = { current: "", next: "", confirm: "" };

interface IProfileSecurityCardProps {
  email: string;
  /** From Supabase Auth; `null` when unknown (mock backend). */
  emailVerified: boolean | null;
  /** False in the mock backend — there is no real credential to change. */
  passwordChangeEnabled: boolean;
  changingPassword: boolean;
  /** Resolves `true` when the password was actually changed. */
  onChangePassword: (draft: { current: string; next: string; confirm: string }) => Promise<boolean>;
}

/**
 * Security block: password change (real), two-factor (not built yet, shown
 * disabled) and the recovery e-mail status.
 */
export function ProfileSecurityCard({
  email,
  emailVerified,
  passwordChangeEnabled,
  changingPassword,
  onChangePassword,
}: IProfileSecurityCardProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [setupOpen, setSetupOpen] = useState(false);
  const [disableOpen, setDisableOpen] = useState(false);
  const twoFactor = useTwoFactor();

  const strength = evaluatePassword(draft.next);
  const validation = validatePasswordChange(draft);
  const mismatch = draft.confirm.length > 0 && draft.confirm !== draft.next;

  const set = (key: keyof typeof EMPTY_DRAFT, value: string) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  const close = () => {
    setOpen(false);
    setDraft(EMPTY_DRAFT);
  };

  const submit = async () => {
    const changed = await onChangePassword(draft);
    if (changed) close();
  };

  return (
    <ProfileSectionCard
      title="Segurança"
      icon="lucide:shield-check"
      iconClassName="text-severity-success"
    >
      <ProfileSettingRow
        icon="lucide:key-round"
        tone="accent"
        title="Senha"
        description={
          passwordChangeEnabled
            ? "Recomendamos trocar a cada 6 meses."
            : "Disponível apenas com a autenticação real (modo Produção)."
        }
        right={
          <Button
            variant="outline"
            size="sm"
            disabled={!passwordChangeEnabled || changingPassword}
            onClick={() => (open ? close() : setOpen(true))}
          >
            {open ? "Cancelar" : "Alterar senha"}
          </Button>
        }
      />

      {open && (
        <div className="grid gap-4 border-b border-border py-4">
          <ProfileField
            label="Senha atual"
            type="password"
            icon="lucide:lock"
            value={draft.current}
            onChange={(v) => set("current", v)}
            autoComplete="current-password"
          />
          <div className="grid gap-4 md:grid-cols-2">
            <ProfileField
              label="Nova senha"
              type="password"
              icon="lucide:lock-keyhole"
              value={draft.next}
              onChange={(v) => set("next", v)}
              autoComplete="new-password"
              hint={`Mínimo ${MIN_PASSWORD_LENGTH} caracteres, com número e maiúscula.`}
            />
            <ProfileField
              label="Confirmar nova senha"
              type="password"
              icon="lucide:lock-keyhole"
              value={draft.confirm}
              onChange={(v) => set("confirm", v)}
              autoComplete="new-password"
              hint={mismatch ? "As senhas não conferem." : undefined}
              hintTone={mismatch ? "critical" : "muted"}
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div
              className="flex max-w-55 flex-1 gap-1"
              role="meter"
              aria-label="Força da senha"
              aria-valuenow={strength.score}
              aria-valuemin={0}
              aria-valuemax={PASSWORD_STRENGTH_BARS}
              aria-valuetext={strength.label}
            >
              {Array.from({ length: PASSWORD_STRENGTH_BARS }).map((_, index) => (
                <span
                  key={index}
                  className={cn(
                    "h-1 flex-1 rounded-full transition-colors",
                    index < strength.filled ? STRENGTH_BAR_CLASS[strength.tone] : "bg-muted",
                  )}
                />
              ))}
            </div>
            <span className={cn("text-xs font-semibold", STRENGTH_TEXT_CLASS[strength.tone])}>
              {strength.label}
            </span>
            <Button
              size="sm"
              className="ml-auto"
              disabled={!validation.ok || changingPassword}
              onClick={() => void submit()}
            >
              {changingPassword ? "Salvando…" : "Confirmar nova senha"}
            </Button>
          </div>
        </div>
      )}

      <ProfileSettingRow
        icon="lucide:smartphone-nfc"
        tone={twoFactor.enabled ? "success" : "muted"}
        title="Verificação em duas etapas (2FA)"
        description={
          !twoFactor.available
            ? "Disponível apenas com a autenticação real (modo Produção)."
            : twoFactor.loading
              ? "Verificando o estado da sua conta…"
              : twoFactor.enabled
                ? "Ativa — pedimos um código do app autenticador a cada login."
                : "Opcional. Ative para exigir um código do app autenticador além da senha."
        }
        right={
          <>
            {!twoFactor.loading && twoFactor.available && (
              <Badge
                variant="outline"
                className={
                  twoFactor.enabled
                    ? "gap-1 border-severity-success/40 text-severity-success"
                    : undefined
                }
              >
                {twoFactor.enabled ? "Ativa" : "Inativa"}
              </Badge>
            )}
            <Switch
              checked={twoFactor.enabled}
              disabled={!twoFactor.available || twoFactor.loading || twoFactor.busy}
              onCheckedChange={(next) => {
                if (next) setSetupOpen(true);
                else setDisableOpen(true);
              }}
              aria-label="Verificação em duas etapas"
            />
          </>
        }
      />

      <ProfileSettingRow
        icon="lucide:mail-check"
        tone={emailVerified ? "success" : "muted"}
        title="Email de recuperação"
        description={
          <>
            {email}
            {emailVerified === true && " · verificado"}
            {emailVerified === false && " · aguardando confirmação"}
          </>
        }
        right={
          <span className="text-xs text-muted-foreground">
            Alterado no bloco “Dados de contato”
          </span>
        }
        last
      />

      <TwoFactorSetupDialog
        open={setupOpen}
        onOpenChange={setSetupOpen}
        onEnabled={() => {
          void twoFactor.refresh();
          toast.success("Verificação em duas etapas ativada", {
            description: "A partir do próximo login pediremos o código do aplicativo.",
          });
        }}
      />

      <AlertDialog open={disableOpen} onOpenChange={setDisableOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desativar a verificação em duas etapas?</AlertDialogTitle>
            <AlertDialogDescription>
              Sua conta voltará a exigir apenas a senha para entrar. Você pode ativar de novo quando
              quiser.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                void twoFactor.disable().then((error) => {
                  if (error) toast.error(error);
                  else toast.success("Verificação em duas etapas desativada");
                });
              }}
            >
              Desativar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ProfileSectionCard>
  );
}
