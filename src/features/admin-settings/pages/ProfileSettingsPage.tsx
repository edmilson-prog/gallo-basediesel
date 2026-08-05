import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/features/auth/useAuth";
import { useSellersProvider, useStoresProvider } from "@/providers/data";
import type { ISeller } from "@/shared/types";
import { SectionHeader } from "../components/SectionHeader";
import { UnsavedChangesDialog } from "../components/UnsavedChangesDialog";
import { useUnsavedChanges } from "../hooks/useUnsavedChanges";
import { useProfileAccount } from "../hooks/useProfileAccount";
import { formatInitials, validateAvatarFile } from "../engine/avatarFile";
import { formatLastAccess, formatMemberSince } from "../engine/profileFormat";
import {
  AvatarCropDialog,
  ProfileContactCard,
  ProfileDangerZone,
  ProfileIdentityHeader,
  ProfileSaveBar,
  ProfileSecurityCard,
  ProfileSessionsCard,
  type IProfileContactDraft,
} from "../components/profile";

function toDraft(seller: ISeller): IProfileContactDraft {
  return {
    fullName: seller.fullName,
    email: seller.email,
    phone: seller.phone ?? "",
    region: seller.region ?? "",
  };
}

function shallowEqual(a: IProfileContactDraft, b: IProfileContactDraft) {
  return (
    a.fullName === b.fullName && a.email === b.email && a.phone === b.phone && a.region === b.region
  );
}

export function ProfileSettingsPage() {
  const { currentUser } = useAuth();
  const sellersProvider = useSellersProvider();
  const storesProvider = useStoresProvider();
  const account = useProfileAccount();

  const [seller, setSeller] = useState<ISeller | null>(null);
  const [storeName, setStoreName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [pendingPhoto, setPendingPhoto] = useState<File | null>(null);
  const [draft, setDraft] = useState<IProfileContactDraft | null>(null);

  const sellerId = currentUser?.sellerId ?? null;

  useEffect(() => {
    if (!sellerId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    sellersProvider
      .get(sellerId)
      .then((s) => {
        if (cancelled) return;
        setSeller(s);
        setDraft(toDraft(s));
      })
      .catch(() => {
        if (!cancelled) toast.error("Não foi possível carregar seu perfil.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sellerId, sellersProvider]);

  // Store label for the identity header — cosmetic, so a failure is silent.
  useEffect(() => {
    const storeId = seller?.storeId;
    if (!storeId) return;
    let cancelled = false;
    void storesProvider
      .get(storeId)
      .then((store) => {
        if (!cancelled) setStoreName(store.name);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [seller?.storeId, storesProvider]);

  const dirty = useMemo(() => {
    if (!seller || !draft) return false;
    return !shallowEqual(draft, toDraft(seller));
  }, [seller, draft]);

  const unsaved = useUnsavedChanges(dirty);

  const handleSave = async () => {
    if (!seller || !draft) return;
    if (!draft.fullName.trim()) {
      toast.error("Informe seu nome completo.");
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(draft.email)) {
      toast.error("Email inválido.");
      return;
    }
    setSaving(true);
    try {
      const next = await sellersProvider.update(seller.id, {
        fullName: draft.fullName.trim(),
        email: draft.email.trim(),
        phone: draft.phone.trim() || undefined,
        region: draft.region.trim() || undefined,
      });
      setSeller(next);
      setDraft(toDraft(next));
      toast.success("Perfil salvo", { description: "O registro foi gerado na auditoria." });
    } catch {
      toast.error("Não foi possível salvar seu perfil.");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (seller) setDraft(toDraft(seller));
  };

  // Picking only opens the framing dialog — the upload happens on confirm, with
  // the cropped result.
  const handlePickPhoto = (file: File) => {
    if (!seller) return;
    const validation = validateAvatarFile(file);
    if (!validation.ok) {
      toast.error(validation.error);
      return;
    }
    setPendingPhoto(file);
  };

  // The photo is applied immediately — it is not part of the contact draft, so
  // it never leaves the save bar in a half-pending state.
  const handleConfirmPhoto = async (cropped: File) => {
    if (!seller) return;
    setUploadingAvatar(true);
    try {
      const url = await sellersProvider.uploadAvatar(seller.id, cropped);
      const next = await sellersProvider.update(seller.id, { avatarUrl: url });
      setSeller(next);
      setPendingPhoto(null);
      toast.success("Foto de perfil atualizada");
    } catch {
      toast.error("Não foi possível enviar a foto. Tente novamente.");
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleRemovePhoto = async () => {
    if (!seller) return;
    setUploadingAvatar(true);
    try {
      const next = await sellersProvider.update(seller.id, { avatarUrl: null });
      setSeller(next);
      toast.success("Foto removida");
    } catch {
      toast.error("Não foi possível remover a foto.");
    } finally {
      setUploadingAvatar(false);
    }
  };

  if (!sellerId) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <SectionHeader title="Meu perfil" description="Atualize seus dados de contato." />
        <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
          Este perfil não está vinculado a um vendedor cadastrado. Apenas usuários da equipe podem
          editar dados aqui.
        </div>
      </div>
    );
  }

  if (loading || !seller || !draft) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-4">
        <SectionHeader title="Meu perfil" description="Atualize seus dados de contato." />
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
        <Skeleton className="h-56 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4">
      <SectionHeader
        title="Meu perfil"
        description="Atualize seus dados de contato e a segurança da sua conta. As mudanças geram registro na auditoria."
      />

      <ProfileIdentityHeader
        fullName={seller.fullName}
        initials={currentUser?.avatarInitials ?? formatInitials(seller.fullName)}
        role={currentUser?.role ?? null}
        email={seller.email}
        storeName={storeName}
        memberSince={formatMemberSince(seller.createdAt)}
        lastAccess={formatLastAccess(account.lastSignInAt)}
        avatarUrl={seller.avatarUrl ?? null}
        uploading={uploadingAvatar}
        onPickFile={handlePickPhoto}
        onRemovePhoto={() => void handleRemovePhoto()}
      />

      <AvatarCropDialog
        file={pendingPhoto}
        busy={uploadingAvatar}
        onCancel={() => setPendingPhoto(null)}
        onConfirm={(cropped) => void handleConfirmPhoto(cropped)}
      />

      <ProfileContactCard
        draft={draft}
        onChange={(key, value) => setDraft({ ...draft, [key]: value })}
        roleLabel={currentUser?.role ?? null}
        showRegion={seller.type !== "internal"}
        emailVerified={account.emailVerified}
      />

      <ProfileSecurityCard
        email={seller.email}
        emailVerified={account.emailVerified}
        passwordChangeEnabled={account.authIsReal}
        changingPassword={account.changingPassword}
        onChangePassword={account.changePassword}
      />

      <div className="grid items-start gap-4 lg:grid-cols-[1.35fr_1fr]">
        <ProfileSessionsCard signedInAt={formatLastAccess(account.lastSignInAt)} />
        <ProfileDangerZone
          enabled={account.authIsReal}
          busy={account.signingOut}
          onSignOutEverywhere={() => void account.signOutEverywhere()}
        />
      </div>

      <ProfileSaveBar
        dirty={dirty}
        saving={saving}
        onSave={() => void handleSave()}
        onDiscard={handleReset}
      />

      <UnsavedChangesDialog
        open={unsaved.promptOpen}
        onConfirmDiscard={unsaved.confirmDiscard}
        onCancel={unsaved.cancel}
      />
    </div>
  );
}
