import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Icon } from "@/components/Icon";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/features/auth/useAuth";
import { useSellersProvider } from "@/providers/data";
import type { ISeller } from "@/shared/types";
import { SectionHeader } from "../components/SectionHeader";
import { UnsavedChangesDialog } from "../components/UnsavedChangesDialog";
import { useUnsavedChanges } from "../hooks/useUnsavedChanges";

interface IProfileDraft {
  fullName: string;
  email: string;
  phone: string;
  region: string;
}

function toDraft(seller: ISeller): IProfileDraft {
  return {
    fullName: seller.fullName,
    email: seller.email,
    phone: seller.phone ?? "",
    region: seller.region ?? "",
  };
}

function shallowEqual(a: IProfileDraft, b: IProfileDraft) {
  return (
    a.fullName === b.fullName && a.email === b.email && a.phone === b.phone && a.region === b.region
  );
}

export function ProfileSettingsPage() {
  const { currentUser } = useAuth();
  const sellersProvider = useSellersProvider();
  const [seller, setSeller] = useState<ISeller | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<IProfileDraft | null>(null);

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
      toast.success("Perfil atualizado", { icon: <Icon icon="mdi:check" size={16} /> });
    } catch {
      toast.error("Não foi possível salvar seu perfil.");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (seller) setDraft(toDraft(seller));
  };

  if (!sellerId) {
    return (
      <div className="space-y-6">
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
      <div className="space-y-6">
        <SectionHeader title="Meu perfil" description="Atualize seus dados de contato." />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Meu perfil"
        description="Atualize seus dados de contato. As mudanças geram registro na auditoria."
      />

      <div className="rounded-lg border border-border bg-card p-6">
        <div className="flex items-center gap-4 border-b border-border pb-6">
          <div
            className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-lg font-semibold text-primary"
            aria-hidden
          >
            {currentUser?.avatarInitials ?? seller.fullName.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <p className="text-sm font-semibold">{seller.fullName}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{currentUser?.role}</Badge>
              <span className="text-xs text-muted-foreground">{seller.email}</span>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Foto de perfil estará disponível na Fase 2 (upload via Supabase Storage).
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="profile-name">Nome completo</Label>
            <Input
              id="profile-name"
              value={draft.fullName}
              onChange={(e) => setDraft({ ...draft, fullName: e.target.value })}
              autoComplete="name"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="profile-email">Email</Label>
            <Input
              id="profile-email"
              type="email"
              value={draft.email}
              onChange={(e) => setDraft({ ...draft, email: e.target.value })}
              autoComplete="email"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="profile-phone">Telefone</Label>
            <Input
              id="profile-phone"
              value={draft.phone}
              placeholder="(55) 99000-0000"
              onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
              autoComplete="tel"
            />
          </div>
          {seller.type !== "internal" && (
            <div className="space-y-1.5">
              <Label htmlFor="profile-region">Região</Label>
              <Input
                id="profile-region"
                value={draft.region}
                placeholder="Ex.: Médio Alto Uruguai"
                onChange={(e) => setDraft({ ...draft, region: e.target.value })}
              />
            </div>
          )}
        </div>

        <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-border pt-6">
          <Button variant="outline" onClick={handleReset} disabled={!dirty || saving}>
            Descartar
          </Button>
          <Button onClick={handleSave} disabled={!dirty || saving}>
            {saving ? "Salvando…" : "Salvar alterações"}
          </Button>
        </div>
      </div>

      <UnsavedChangesDialog
        open={unsaved.promptOpen}
        onConfirmDiscard={unsaved.confirmDiscard}
        onCancel={unsaved.cancel}
      />
    </div>
  );
}
