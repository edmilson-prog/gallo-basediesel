import { useEffect, useMemo, useState } from "react";
import { useBlocker } from "@tanstack/react-router";
import { toast } from "sonner";
import type { IStorefrontConfig, PartCategory } from "@/shared/types";
import { DEFAULT_STOREFRONT_CONFIG } from "@/shared/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Icon } from "@/components/Icon";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCurrentRole } from "@/features/rbac/hooks/useCurrentRole";
import { useCurrentStore } from "@/features/multistore";
import { EmptyState } from "@/features/shell/components/EmptyState";
import { SectionHeader } from "@/features/admin-settings/components/SectionHeader";
import { usePlatformSettings } from "@/features/admin-settings/hooks/usePlatformSettings";
import { PART_CATEGORY_DESCRIPTORS } from "@/features/catalog";
import {
  KNOWN_CATEGORY_SLUGS,
  KNOWN_SPECIAL_SLUGS,
  iconForSlug,
  nameForSlug,
} from "@/features/storefront-category/data/slugs";
import { STOREFRONT_STRINGS as S } from "../i18n/pt-BR";

/**
 * `/app/configuracoes/storefront` — Owner-only editor of the public vitrine
 * configuration (PRD-060 RF-023–RF-026).
 *
 * Persists into `IPlatformSettings.storefront`. Edits propagate to /loja on
 * the next render thanks to react-query refetch + the storefront settings hook.
 */
export interface IStorefrontConfigPageProps {
  /**
   * Which block to render (PRD-066 RF-007): `home` shows the home editors,
   * `categorias` shows the per-category editor, `all` (default) shows both —
   * keeping the original standalone behaviour intact.
   */
  section?: "home" | "categorias" | "all";
}

export function StorefrontConfigPage({ section = "all" }: IStorefrontConfigPageProps = {}) {
  const showHome = section === "home" || section === "all";
  const showCategorias = section === "categorias" || section === "all";
  const role = useCurrentRole();
  const { currentStoreId } = useCurrentStore();
  const storeId = currentStoreId ?? "store-matriz";
  const { settings, loading, saving, update } = usePlatformSettings(storeId);

  const [draft, setDraft] = useState<IStorefrontConfig>(DEFAULT_STOREFRONT_CONFIG);

  useEffect(() => {
    if (settings) setDraft(settings.storefront);
  }, [settings]);

  const dirty = useMemo(() => {
    if (!settings) return false;
    return JSON.stringify(draft) !== JSON.stringify(settings.storefront);
  }, [settings, draft]);

  // RF-012: warn before leaving with unsaved content changes.
  const blocker = useBlocker({ shouldBlockFn: () => dirty, withResolver: true });

  if (role !== "Owner") {
    return (
      <EmptyState
        icon="mdi:shield-lock-outline"
        title="Apenas Owner"
        description="A configuração da vitrine pública é restrita ao Owner."
        actionLabel="Voltar"
        actionTo="/app/configuracoes"
      />
    );
  }

  if (loading || !settings) {
    return (
      <div className="space-y-6">
        <SectionHeader title={S.configPageTitle} description="Carregando..." />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  const handleSave = async () => {
    try {
      await update({ storefront: draft }, "storefront_config_update");
      toast.success(S.configSaved);
    } catch {
      toast.error(S.configSaveFailed);
    }
  };

  const handleReset = () => setDraft(settings.storefront);

  const toggleCategory = (cat: PartCategory) => {
    setDraft((prev) => {
      const has = prev.featuredCategories.includes(cat);
      const next = has
        ? prev.featuredCategories.filter((c) => c !== cat)
        : [...prev.featuredCategories, cat].slice(0, 6);
      return { ...prev, featuredCategories: next };
    });
  };

  const getCategoryOverride = (slug: string): string => {
    const entry = draft.categories?.find((c) => c.slug === slug);
    return entry?.description ?? "";
  };

  const updateCategoryDescription = (slug: string, value: string) => {
    setDraft((prev) => {
      const list = prev.categories ?? [];
      const idx = list.findIndex((c) => c.slug === slug);
      const trimmed = value.trim();
      if (idx === -1) {
        if (trimmed.length === 0) return prev;
        return { ...prev, categories: [...list, { slug, description: value }] };
      }
      const next = [...list];
      const current = next[idx];
      // Drop the entry entirely when both fields are empty to keep config tidy.
      if (trimmed.length === 0 && (current.promotionPartIds ?? []).length === 0) {
        next.splice(idx, 1);
      } else {
        next[idx] = { ...current, description: value };
      }
      return { ...prev, categories: next };
    });
  };

  const getPromotionIdsCsv = (): string => {
    const entry = draft.categories?.find((c) => c.slug === "promocoes");
    return (entry?.promotionPartIds ?? []).join(", ");
  };

  const updatePromotionIds = (raw: string) => {
    const ids = raw
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
    setDraft((prev) => {
      const list = prev.categories ?? [];
      const idx = list.findIndex((c) => c.slug === "promocoes");
      if (idx === -1) {
        if (ids.length === 0) return prev;
        return { ...prev, categories: [...list, { slug: "promocoes", promotionPartIds: ids }] };
      }
      const next = [...list];
      const current = next[idx];
      const hasDescription = (current.description ?? "").trim().length > 0;
      if (ids.length === 0 && !hasDescription) {
        next.splice(idx, 1);
      } else {
        next[idx] = { ...current, promotionPartIds: ids };
      }
      return { ...prev, categories: next };
    });
  };

  return (
    <div className="space-y-6">
      <SectionHeader
        title={S.configPageTitle}
        description="Edite a home pública (/loja) — mudanças refletem em produção imediatamente."
      />

      <Card className="space-y-1 border-primary/30 bg-primary/5 p-4">
        <div className="flex items-start gap-3">
          <Icon icon="mdi:storefront" size={20} className="mt-0.5 text-primary" />
          <p className="text-xs text-muted-foreground">{S.configDemoBanner}</p>
        </div>
      </Card>

      {/* Hero */}
      {showHome && (
        <Card className="space-y-4 p-6">
          <h2 className="text-base font-semibold text-foreground">{S.configSectionHero}</h2>
          <div className="space-y-2">
            <Label htmlFor="hero-headline">{S.configHeadlineLabel}</Label>
            <Input
              id="hero-headline"
              value={draft.hero.headline}
              onChange={(e) =>
                setDraft((p) => ({ ...p, hero: { ...p.hero, headline: e.target.value } }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="hero-subheadline">{S.configSubheadlineLabel}</Label>
            <Textarea
              id="hero-subheadline"
              rows={2}
              value={draft.hero.subheadline}
              onChange={(e) =>
                setDraft((p) => ({ ...p, hero: { ...p.hero, subheadline: e.target.value } }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label>Indicadores de confiança (até 3)</Label>
            {[0, 1, 2].map((idx) => (
              <Input
                key={idx}
                placeholder={`${S.configIndicatorLabel} ${idx + 1}`}
                value={draft.hero.indicators[idx] ?? ""}
                onChange={(e) =>
                  setDraft((p) => {
                    const next = [...p.hero.indicators];
                    next[idx] = e.target.value;
                    return {
                      ...p,
                      hero: { ...p.hero, indicators: next.filter(Boolean) },
                    };
                  })
                }
              />
            ))}
          </div>
        </Card>
      )}

      {/* Featured categories */}
      {showHome && (
        <Card className="space-y-4 p-6">
          <div>
            <h2 className="text-base font-semibold text-foreground">{S.configSectionCategories}</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Selecione até 6 categorias para destacar na home.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {PART_CATEGORY_DESCRIPTORS.map((cat) => {
              const checked = draft.featuredCategories.includes(cat.value);
              return (
                <label
                  key={cat.value}
                  className="flex cursor-pointer items-center gap-2 rounded-sm border border-border bg-card px-3 py-2 text-sm hover:border-primary/50"
                >
                  <Checkbox checked={checked} onCheckedChange={() => toggleCategory(cat.value)} />
                  <Icon icon={cat.icon} size={16} className="text-primary" aria-hidden />
                  {cat.label}
                </label>
              );
            })}
          </div>
        </Card>
      )}

      {/* Featured products mode */}
      {showHome && (
        <Card className="space-y-4 p-6">
          <h2 className="text-base font-semibold text-foreground">{S.configSectionFeatured}</h2>
          <div className="space-y-2">
            <Label htmlFor="featured-mode">{S.configFeaturedModeLabel}</Label>
            <Select
              value={draft.featuredProducts.mode}
              onValueChange={(v) =>
                setDraft((p) => ({
                  ...p,
                  featuredProducts: {
                    ...p.featuredProducts,
                    mode: v as IStorefrontConfig["featuredProducts"]["mode"],
                  },
                }))
              }
            >
              <SelectTrigger id="featured-mode" className="bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="top-selling">{S.configFeaturedAuto}</SelectItem>
                <SelectItem value="manual">{S.configFeaturedManual}</SelectItem>
              </SelectContent>
            </Select>
            {draft.featuredProducts.mode === "manual" && (
              <p className="text-xs text-muted-foreground">
                Edite o array <code className="font-mono">manualPartIds</code> no JSON da loja
                (curadoria manual será exposta via UI na Fase 2).
              </p>
            )}
          </div>
        </Card>
      )}

      {/* Category pages (PRD-062) */}
      {showCategorias && (
        <Card className="space-y-4 p-6">
          <div>
            <h2 className="text-base font-semibold text-foreground">
              {S.configSectionCategoryPages}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">{S.configCategoryPagesHint}</p>
          </div>
          <div className="space-y-3">
            {KNOWN_CATEGORY_SLUGS.map((slug) => (
              <div
                key={slug}
                className="grid gap-2 rounded-md border border-border p-3 sm:grid-cols-[10rem_1fr] sm:items-start"
              >
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Icon icon={iconForSlug(slug)} size={16} className="text-primary" aria-hidden />
                  {nameForSlug(slug)}
                </div>
                <Textarea
                  rows={2}
                  placeholder={S.configCategoryDescriptionPlaceholder}
                  value={getCategoryOverride(slug)}
                  onChange={(e) => updateCategoryDescription(slug, e.target.value)}
                />
              </div>
            ))}
          </div>

          <div className="space-y-3 border-t border-border pt-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Listas especiais
            </p>
            {KNOWN_SPECIAL_SLUGS.map((slug) => (
              <div
                key={slug}
                className="grid gap-2 rounded-md border border-border p-3 sm:grid-cols-[10rem_1fr] sm:items-start"
              >
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Icon icon={iconForSlug(slug)} size={16} className="text-primary" aria-hidden />
                  {nameForSlug(slug)}
                </div>
                <Textarea
                  rows={2}
                  placeholder={S.configCategoryDescriptionPlaceholder}
                  value={getCategoryOverride(slug)}
                  onChange={(e) => updateCategoryDescription(slug, e.target.value)}
                />
              </div>
            ))}
          </div>

          <div className="space-y-2 border-t border-border pt-4">
            <Label htmlFor="promotion-ids">{S.configPromotionsTitle}</Label>
            <p className="text-xs text-muted-foreground">{S.configPromotionsHint}</p>
            <Input
              id="promotion-ids"
              placeholder={S.configPromotionsPlaceholder}
              value={getPromotionIdsCsv()}
              onChange={(e) => updatePromotionIds(e.target.value)}
            />
          </div>
        </Card>
      )}

      {/* Why buy */}
      {showHome && (
        <Card className="space-y-4 p-6">
          <h2 className="text-base font-semibold text-foreground">{S.configSectionBenefits}</h2>
          <div className="space-y-3">
            {draft.whyBuy.slice(0, 4).map((benefit, idx) => (
              <div
                key={idx}
                className="grid gap-2 rounded-md border border-border p-3 sm:grid-cols-[1fr_2fr]"
              >
                <Input
                  placeholder="Título"
                  value={benefit.title}
                  onChange={(e) =>
                    setDraft((p) => {
                      const next = [...p.whyBuy];
                      next[idx] = { ...next[idx], title: e.target.value };
                      return { ...p, whyBuy: next };
                    })
                  }
                />
                <Input
                  placeholder="Descrição"
                  value={benefit.description}
                  onChange={(e) =>
                    setDraft((p) => {
                      const next = [...p.whyBuy];
                      next[idx] = { ...next[idx], description: e.target.value };
                      return { ...p, whyBuy: next };
                    })
                  }
                />
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* About */}
      {showHome && (
        <Card className="space-y-4 p-6">
          <h2 className="text-base font-semibold text-foreground">{S.configSectionAbout}</h2>
          <div className="space-y-2">
            <Label htmlFor="about-headline">Título</Label>
            <Input
              id="about-headline"
              value={draft.about.headline}
              onChange={(e) =>
                setDraft((p) => ({ ...p, about: { ...p.about, headline: e.target.value } }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="about-body">Texto institucional</Label>
            <Textarea
              id="about-body"
              rows={4}
              value={draft.about.body}
              onChange={(e) =>
                setDraft((p) => ({ ...p, about: { ...p.about, body: e.target.value } }))
              }
            />
          </div>
        </Card>
      )}

      {/* Footer */}
      {showHome && (
        <Card className="space-y-4 p-6">
          <h2 className="text-base font-semibold text-foreground">{S.configSectionFooter}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="footer-phone">Telefone</Label>
              <Input
                id="footer-phone"
                value={draft.footer.phone}
                onChange={(e) =>
                  setDraft((p) => ({ ...p, footer: { ...p.footer, phone: e.target.value } }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="footer-whatsapp">WhatsApp</Label>
              <Input
                id="footer-whatsapp"
                value={draft.footer.whatsapp}
                onChange={(e) =>
                  setDraft((p) => ({
                    ...p,
                    footer: { ...p.footer, whatsapp: e.target.value },
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="footer-email">E-mail</Label>
              <Input
                id="footer-email"
                type="email"
                value={draft.footer.email}
                onChange={(e) =>
                  setDraft((p) => ({ ...p, footer: { ...p.footer, email: e.target.value } }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="footer-address">Endereço</Label>
              <Input
                id="footer-address"
                value={draft.footer.address}
                onChange={(e) =>
                  setDraft((p) => ({
                    ...p,
                    footer: { ...p.footer, address: e.target.value },
                  }))
                }
              />
            </div>
          </div>
        </Card>
      )}

      {/* SEO */}
      {showHome && (
        <Card className="space-y-4 p-6">
          <h2 className="text-base font-semibold text-foreground">{S.configSectionSeo}</h2>
          <div className="space-y-2">
            <Label htmlFor="seo-title">Title (≤ 60 chars)</Label>
            <Input
              id="seo-title"
              value={draft.seo.title}
              maxLength={80}
              onChange={(e) =>
                setDraft((p) => ({ ...p, seo: { ...p.seo, title: e.target.value } }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="seo-description">Description (≤ 160 chars)</Label>
            <Textarea
              id="seo-description"
              rows={2}
              maxLength={200}
              value={draft.seo.description}
              onChange={(e) =>
                setDraft((p) => ({ ...p, seo: { ...p.seo, description: e.target.value } }))
              }
            />
          </div>
        </Card>
      )}

      <div className="sticky bottom-4 z-10 flex flex-wrap justify-end gap-2 rounded-md border border-border bg-card/95 p-3 backdrop-blur">
        <Button variant="outline" onClick={handleReset} disabled={!dirty || saving}>
          Descartar
        </Button>
        <Button onClick={handleSave} disabled={!dirty || saving}>
          {saving ? "Salvando…" : "Salvar alterações"}
        </Button>
      </div>

      <AlertDialog open={blocker.status === "blocked"}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Alterações não salvas</AlertDialogTitle>
            <AlertDialogDescription>
              Você tem alterações de conteúdo não salvas. Se sair agora, elas serão perdidas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => blocker.reset?.()}>
              Continuar editando
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => blocker.proceed?.()}>
              Descartar e sair
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
