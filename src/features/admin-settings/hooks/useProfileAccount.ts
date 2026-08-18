import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { getSupabaseClient } from "@/shared/lib/supabase";
import { AUTH_SOURCE } from "@/features/auth/authSource";
import { type IPasswordChangeDraft, validatePasswordChange } from "../engine/passwordStrength";

interface IAccountFacts {
  /** `null` while loading or when the backend cannot tell. */
  emailVerified: boolean | null;
  lastSignInAt: string | null;
}

export interface IProfileAccount extends IAccountFacts {
  /** True when a real credential backend is behind the session. */
  authIsReal: boolean;
  changingPassword: boolean;
  signingOut: boolean;
  /** Resolves `true` only when the password was actually changed. */
  changePassword: (draft: IPasswordChangeDraft) => Promise<boolean>;
  signOutEverywhere: () => Promise<void>;
}

/**
 * Account-level facts and actions for "Meu perfil" that live in Supabase Auth
 * rather than in the `sellers` row: e-mail verification, last sign-in, password
 * change and global sign-out.
 *
 * All of it is inert in the mock backend — there is no server session there.
 */
export function useProfileAccount(): IProfileAccount {
  const authIsReal = AUTH_SOURCE === "supabase";
  const [facts, setFacts] = useState<IAccountFacts>({ emailVerified: null, lastSignInAt: null });
  const [changingPassword, setChangingPassword] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    if (!authIsReal) return;
    let cancelled = false;
    void getSupabaseClient()
      .auth.getUser()
      .then(({ data, error }) => {
        if (cancelled || error || !data.user) return;
        setFacts({
          emailVerified: Boolean(data.user.email_confirmed_at),
          lastSignInAt: data.user.last_sign_in_at ?? null,
        });
      })
      .catch(() => {
        // Transient read — the header simply omits these two lines.
      });
    return () => {
      cancelled = true;
    };
  }, [authIsReal]);

  const changePassword = useCallback(
    async (draft: IPasswordChangeDraft): Promise<boolean> => {
      const validation = validatePasswordChange(draft);
      if (!validation.ok) {
        toast.error(validation.error);
        return false;
      }
      if (!authIsReal) {
        toast.error("A troca de senha exige a autenticação real (modo Produção).");
        return false;
      }

      setChangingPassword(true);
      try {
        const supabase = getSupabaseClient();
        const { data: userData } = await supabase.auth.getUser();
        const email = userData.user?.email;
        if (!email) {
          toast.error("Sessão não encontrada. Entre novamente e tente de novo.");
          return false;
        }

        // Supabase does not check the current password on updateUser, so we
        // verify it explicitly. A failed attempt leaves the session untouched.
        const { error: reauthError } = await supabase.auth.signInWithPassword({
          email,
          password: draft.current,
        });
        if (reauthError) {
          toast.error("Senha atual incorreta.");
          return false;
        }

        const { error: updateError } = await supabase.auth.updateUser({ password: draft.next });
        if (updateError) {
          toast.error(`Não foi possível alterar a senha: ${updateError.message}`);
          return false;
        }

        toast.success("Senha alterada", {
          description: "Você continua conectado neste dispositivo.",
        });
        return true;
      } catch {
        toast.error("Não foi possível alterar a senha. Tente novamente.");
        return false;
      } finally {
        setChangingPassword(false);
      }
    },
    [authIsReal],
  );

  const signOutEverywhere = useCallback(async () => {
    if (!authIsReal) return;
    setSigningOut(true);
    try {
      // Global scope revokes every session server-side, this one included —
      // the regular app logout deliberately stays `local` (see the ghost-session
      // incident); here revoking everything IS the point.
      const { error } = await getSupabaseClient().auth.signOut({ scope: "global" });
      if (error) {
        toast.error(`Não foi possível encerrar as sessões: ${error.message}`);
        return;
      }
      toast.success("Todas as sessões foram encerradas");
      // Full reload so every provider re-bootstraps against the dead session.
      window.location.assign("/auth/login");
    } catch {
      toast.error("Não foi possível encerrar as sessões. Tente novamente.");
    } finally {
      setSigningOut(false);
    }
  }, [authIsReal]);

  return {
    ...facts,
    authIsReal,
    changingPassword,
    signingOut,
    changePassword,
    signOutEverywhere,
  };
}
