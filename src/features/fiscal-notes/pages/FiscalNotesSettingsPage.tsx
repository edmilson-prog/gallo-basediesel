import { useState } from "react";
import { Icon } from "@/components/Icon";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import type { IngestionSource } from "@/shared/types";

interface ISourceRow {
  key: IngestionSource;
  label: string;
  description: string;
  /** `null` quando a origem está disponível; motivo quando está travada. */
  blockedReason: string | null;
  missing?: string;
  defaultEnabled: boolean;
}

const SOURCES: ISourceRow[] = [
  {
    key: "upload",
    label: "Upload manual · parse no navegador",
    description:
      "Arrastar o XML na tela de importação. O arquivo é lido no navegador e a nota entra em conferência.",
    blockedReason: null,
    defaultEnabled: true,
  },
  {
    key: "upload_edge",
    label: "Upload manual · parse na Edge Function",
    description:
      "Mesmo arquivo, lido no servidor pela função fiscal-note-import. Centraliza a validação fiscal fora do navegador.",
    blockedReason: null,
    defaultEnabled: false,
  },
  {
    key: "email",
    label: "Caixa de e-mail monitorada",
    description: "Uma função agendada lê a caixa e enfileira os XML que os fornecedores enviam.",
    blockedReason: "Falta a credencial da caixa no Vault.",
    missing: "credencial de e-mail",
    defaultEnabled: false,
  },
  {
    key: "sefaz",
    label: "Consulta à SEFAZ pela chave",
    description:
      "Informando os 44 dígitos da DANFE, o XML é baixado direto da SEFAZ — sem precisar do arquivo.",
    blockedReason: "Falta o certificado digital A1 da empresa no Vault.",
    missing: "certificado A1",
    defaultEnabled: false,
  },
];

/**
 * Configuração das origens de ingestão (PRD-216, Fase 4).
 *
 * E-mail e SEFAZ aparecem travados com o motivo escrito, em vez de omitidos:
 * switch desabilitado que explica o que falta ensina o caminho; switch ausente
 * só esconde a capacidade.
 */
export function FiscalNotesSettingsPage() {
  const [enabled, setEnabled] = useState<Record<IngestionSource, boolean>>(() => {
    const initial = {} as Record<IngestionSource, boolean>;
    for (const source of SOURCES) initial[source.key] = source.defaultEnabled;
    return initial;
  });

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:px-6">
      <header className="mb-5">
        <h1 className="font-display text-xl font-extrabold uppercase leading-none tracking-[0.01em] text-foreground">
          Notas fiscais
        </h1>
        <p className="mt-1.5 max-w-2xl text-[12.5px] text-muted-foreground">
          De onde os XML de NF-e entram. O upload manual funciona sem nenhuma configuração; as
          demais origens dependem de material que precisa ser cadastrado no Vault.
        </p>
      </header>

      <div className="flex flex-col gap-3">
        {SOURCES.map((source) => {
          const blocked = source.blockedReason !== null;
          return (
            <section
              key={source.key}
              className={`rounded-xl border bg-card p-4 ${blocked ? "border-border" : "border-border"}`}
            >
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-sm font-bold text-foreground">{source.label}</h2>
                    {blocked && (
                      <Badge
                        variant="outline"
                        className="border-severity-warning/40 text-severity-warning"
                      >
                        <Icon icon="mdi:lock-outline" size={11} aria-hidden />
                        indisponível
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
                    {source.description}
                  </p>
                  {blocked && (
                    <p className="mt-2 flex items-start gap-1.5 text-[12px] text-severity-warning">
                      <Icon
                        icon="mdi:information-outline"
                        size={13}
                        className="mt-0.5 shrink-0"
                        aria-hidden
                      />
                      <span>
                        {source.blockedReason} Enquanto o {source.missing} não estiver cadastrado, a
                        função responde 503 e nenhum XML entra por aqui.
                      </span>
                    </p>
                  )}
                </div>
                <Switch
                  checked={enabled[source.key]}
                  disabled={blocked}
                  onCheckedChange={(next) =>
                    setEnabled((prev) => ({ ...prev, [source.key]: next }))
                  }
                  aria-label={source.label}
                />
              </div>
            </section>
          );
        })}
      </div>

      <p className="mt-5 text-[11.5px] text-muted-foreground">
        A tabela <span className="font-mono">fiscal_note_settings</span> guarda estes switches por
        loja. Enquanto a migration não for aplicada, esta tela mostra os valores padrão e não
        persiste a mudança.
      </p>
    </div>
  );
}
