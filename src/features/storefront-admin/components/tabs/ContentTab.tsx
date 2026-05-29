import { useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/Icon";
import { StorefrontConfigPage } from "@/features/storefront";
import { STOREFRONT_ADMIN_STRINGS as S } from "../../i18n/pt-BR";

const THEME_COLORS = [
  { label: "Primária (PARTS)", token: "bg-primary" },
  { label: "Fundo", token: "bg-background border border-border" },
  { label: "Cartão", token: "bg-card border border-border" },
  { label: "Destaque", token: "bg-accent" },
];

export interface IContentTabProps {
  /** Sub-tab to open by default ("home", "categorias" or "identidade"). */
  defaultSubtab?: string;
}

type ContentSubtab = "home" | "categorias" | "identidade";

function normalizeSubtab(value: string | undefined): ContentSubtab {
  return value === "categorias" || value === "identidade" ? value : "home";
}

/**
 * Consolidates the storefront content editors (PRD-060/062) under the admin
 * panel (PRD-066 RF-007/008/009/010) in three sub-tabs: Home, Categorias and
 * Identidade. Home/Categorias reuse `StorefrontConfigPage` (no logic
 * duplication) via its `section` prop, kept as a single mounted instance so the
 * shared draft + save bar persist while toggling between the two editors.
 */
export function ContentTab({ defaultSubtab = "home" }: IContentTabProps) {
  const [subtab, setSubtab] = useState<ContentSubtab>(normalizeSubtab(defaultSubtab));

  return (
    <Tabs value={subtab} onValueChange={(v) => setSubtab(v as ContentSubtab)} className="space-y-4">
      <TabsList>
        <TabsTrigger value="home">{S.contentSubHome}</TabsTrigger>
        <TabsTrigger value="categorias">{S.contentSubCategories}</TabsTrigger>
        <TabsTrigger value="identidade">{S.contentSubIdentity}</TabsTrigger>
      </TabsList>

      {subtab !== "identidade" ? (
        <StorefrontConfigPage section={subtab} />
      ) : (
        <div className="space-y-4">
          <Card className="flex items-start gap-3 border-primary/30 bg-primary/5 p-4">
            <Icon icon="mdi:palette-outline" size={18} className="mt-0.5 text-primary" />
            <p className="text-xs text-muted-foreground">{S.identityPhase2}</p>
          </Card>

          <Card className="space-y-3 p-6">
            <h2 className="text-base font-semibold text-foreground">{S.identityLogoLabel}</h2>
            <div className="flex h-28 w-full items-center justify-center rounded-md border border-dashed border-border bg-muted/30 text-sm text-muted-foreground">
              <div className="flex flex-col items-center gap-1">
                <Icon icon="mdi:image-outline" size={28} aria-hidden />
                {S.identityLogoPlaceholder}
              </div>
            </div>
          </Card>

          <Card className="space-y-4 p-6">
            <h2 className="text-base font-semibold text-foreground">{S.identityColorsLabel}</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {THEME_COLORS.map((c) => (
                <div key={c.label} className="space-y-2">
                  <div className={`h-14 w-full rounded-md ${c.token}`} aria-hidden />
                  <p className="text-xs text-muted-foreground">{c.label}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
    </Tabs>
  );
}
