// src/features/admin-settings/pages/MediaRetentionSettingsPage.tsx
import { Icon } from "@/components/Icon";
import { MEDIA_STRINGS } from "@/features/media/i18n/pt-BR";
import { SectionHeader } from "../components/SectionHeader";
import { PlaceholderSection } from "../components/PlaceholderSection";

/**
 * Retention placeholder card for PRD-026 media governance (D-5).
 * Shows the static 365-day / 1825-day retention policy.
 * Actual purge automation arrives in Fase 2 (Supabase cron / Edge Function).
 */
export function MediaRetentionSettingsPage() {
  const r = MEDIA_STRINGS.retention;
  return (
    <PlaceholderSection
      title={r.title}
      description={r.description}
      icon="mdi:database-clock-outline"
      prdCodes="026"
      whatComes={[
        "Configurar período de retenção por tipo de mídia e por loja",
        "Habilitar expurgo automático via cron (Supabase Edge Function)",
        "Política diferenciada para mídias sensíveis (LGPD Art. 16)",
        "Exportação de relatório de mídias prestes a expirar",
        "Notificação ao Owner/Gestor 30 dias antes do expurgo",
      ]}
      statusNote="Nenhum expurgo ocorre na Fase 1. Os valores abaixo são os defaults planejados para a política LGPD."
    >
      {/* Read-only retention card (D-5) */}
      <section className="rounded-lg border border-border bg-card p-4">
        <div className="mb-2 flex items-center gap-2">
          <Icon
            icon="mdi:database-clock-outline"
            size={18}
            className="text-muted-foreground"
          />
          <h3 className="text-sm font-semibold text-foreground">{r.title}</h3>
        </div>
        <p className="mb-3 text-xs text-muted-foreground">{r.description}</p>
        <dl className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <dt className="text-muted-foreground">{r.common.label}</dt>
            <dd className="text-foreground">{r.common.value}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{r.sensitive.label}</dt>
            <dd className="text-foreground">{r.sensitive.value}</dd>
          </div>
        </dl>
      </section>
    </PlaceholderSection>
  );
}
