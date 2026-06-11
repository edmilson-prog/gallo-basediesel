import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Icon } from "@/components/Icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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
import { getActiveDataSource } from "@/providers/data";
import { AUTH_SOURCE } from "@/features/auth/authSource";
import { writeAuthSyncMirror } from "@/features/auth/authSession";
import {
  AUTH_SOURCE_OVERRIDE_KEY,
  DATA_SOURCE_OVERRIDE_KEY,
  presetOf,
  presetSources,
  readSourceOverride,
  resolveSourceMode,
  writeSourceOverride,
  type EnvironmentPreset,
  type SourceMode,
} from "@/shared/lib/environmentMode";
import { SectionHeader } from "../components/SectionHeader";

const MODE_LABEL: Record<SourceMode, { data: string; auth: string }> = {
  supabase: { data: "Banco real (Supabase)", auth: "E-mail e senha (real)" },
  mock: { data: "Demonstração (fictícios)", auth: "Seleção de perfil (demonstração)" },
};

const PRESET_META: Record<
  EnvironmentPreset,
  { label: string; icon: string; description: string; selectedClass: string; checkClass: string }
> = {
  production: {
    label: "Produção",
    icon: "mdi:rocket-launch-outline",
    description:
      "Dados reais do banco e login por e-mail e senha. É o ambiente que sua equipe e clientes usam de verdade.",
    selectedClass:
      "border-severity-success/50 bg-severity-success/10 ring-1 ring-severity-success/30",
    checkClass: "text-severity-success",
  },
  demo: {
    label: "Demonstração",
    icon: "mdi:flask-outline",
    description:
      "Dados fictícios e login por seleção de perfil. Tudo o que você fizer aqui é descartável e não afeta nada real.",
    selectedClass: "border-severity-info/50 bg-severity-info/10 ring-1 ring-severity-info/30",
    checkClass: "text-severity-info",
  },
  custom: {
    label: "Personalizado",
    icon: "mdi:tune-variant",
    description: "Combinação mista de dados e login, configurada manualmente abaixo.",
    selectedClass:
      "border-severity-warning/50 bg-severity-warning/10 ring-1 ring-severity-warning/30",
    checkClass: "text-severity-warning",
  },
};

/**
 * Owner-only runtime switch between Demonstração and Produção
 * (Configurações → Avançado → Ambiente & Dados).
 *
 * The choice persists in localStorage as a PER-BROWSER override of the
 * build-time env defaults and is materialized by a full page reload — the app
 * resolves its sources once at boot (factory.ts / authSource.ts). Switching
 * the auth dimension implicitly ends the current session.
 */
export function EnvironmentModePage() {
  // Active values were resolved at boot; env defaults are what the build ships.
  const activeData = useMemo(() => getActiveDataSource(), []);
  const activeAuth = AUTH_SOURCE;
  const envData = useMemo(() => resolveSourceMode(import.meta.env.VITE_DATA_SOURCE, null), []);
  const envAuth = useMemo(() => resolveSourceMode(import.meta.env.VITE_AUTH_SOURCE, null), []);
  const hasOverride =
    readSourceOverride(DATA_SOURCE_OVERRIDE_KEY) !== null ||
    readSourceOverride(AUTH_SOURCE_OVERRIDE_KEY) !== null;

  const [selectedData, setSelectedData] = useState<SourceMode>(activeData);
  const [selectedAuth, setSelectedAuth] = useState<SourceMode>(activeAuth);
  const [advancedOpen, setAdvancedOpen] = useState(
    () => presetOf(activeData, activeAuth) === "custom",
  );
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [applying, setApplying] = useState(false);

  const activePreset = presetOf(activeData, activeAuth);
  const selectedPreset = presetOf(selectedData, selectedAuth);
  const dirty = selectedData !== activeData || selectedAuth !== activeAuth;
  const authChanges = selectedAuth !== activeAuth;
  const dataChanges = selectedData !== activeData;

  const selectPreset = (preset: Exclude<EnvironmentPreset, "custom">) => {
    const sources = presetSources(preset);
    setSelectedData(sources.data);
    setSelectedAuth(sources.auth);
  };

  const apply = (data: SourceMode, auth: SourceMode) => {
    setApplying(true);
    // Store the override only where it diverges from the build default — when
    // the choice matches the env, clearing the key keeps "no override" truthful.
    writeSourceOverride(DATA_SOURCE_OVERRIDE_KEY, data === envData ? null : data);
    writeSourceOverride(AUTH_SOURCE_OVERRIDE_KEY, auth === envAuth ? null : auth);
    if (auth !== activeAuth) {
      // The session belongs to the outgoing auth backend — clear the sync
      // mirror so guards land on the login screen after the reload.
      writeAuthSyncMirror(null);
    }
    const label = PRESET_META[presetOf(data, auth)].label;
    toast.loading(`Aplicando o modo ${label}… a página vai recarregar.`);
    window.location.reload();
  };

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Ambiente & Dados"
        description="Alterne entre o ambiente de demonstração e o de produção sem mexer em configurações de servidor."
      />

      {/* Preset cards */}
      <RadioGroup
        value={selectedPreset === "custom" ? "" : selectedPreset}
        onValueChange={(value) => {
          if (value === "production" || value === "demo") selectPreset(value);
        }}
        className="grid gap-4 sm:grid-cols-2"
        aria-label="Modo do ambiente"
      >
        {(["production", "demo"] as const).map((preset) => {
          const meta = PRESET_META[preset];
          const sources = presetSources(preset);
          const selected = selectedPreset === preset;
          return (
            <Label
              key={preset}
              htmlFor={`preset-${preset}`}
              className={cn(
                "relative flex cursor-pointer flex-col gap-2 rounded-lg border p-4 transition-colors",
                selected
                  ? meta.selectedClass
                  : "border-border bg-card hover:border-border/80 hover:bg-accent/40",
              )}
            >
              <RadioGroupItem id={`preset-${preset}`} value={preset} className="sr-only" />
              {selected && (
                <Icon
                  icon="mdi:check-circle"
                  aria-hidden
                  className={cn("absolute right-3 top-3 size-5", meta.checkClass)}
                />
              )}
              <div className="flex items-center gap-2">
                <Icon icon={meta.icon} className="size-5" />
                <span className="text-sm font-semibold">{meta.label}</span>
                {activePreset === preset && (
                  <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
                    Ativo
                  </Badge>
                )}
              </div>
              <p className="text-xs font-normal leading-relaxed text-muted-foreground">
                {meta.description}
              </p>
              <p className="font-mono text-[11px] text-muted-foreground">
                dados: {sources.data === "supabase" ? "supabase" : "demonstração"} · login:{" "}
                {sources.auth === "supabase" ? "supabase" : "perfis fictícios"}
              </p>
            </Label>
          );
        })}
      </RadioGroup>

      {/* Custom (mixed) state card — only visible when the selection is mixed */}
      {selectedPreset === "custom" && (
        <div
          className={cn(
            "relative flex flex-col gap-2 rounded-lg border p-4",
            PRESET_META.custom.selectedClass,
          )}
        >
          <Icon
            icon="mdi:check-circle"
            aria-hidden
            className={cn("absolute right-3 top-3 size-5", PRESET_META.custom.checkClass)}
          />
          <div className="flex items-center gap-2">
            <Icon icon={PRESET_META.custom.icon} className="size-5" />
            <span className="text-sm font-semibold">{PRESET_META.custom.label}</span>
            {activePreset === "custom" && (
              <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
                Ativo
              </Badge>
            )}
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {PRESET_META.custom.description}
          </p>
          <p className="font-mono text-[11px] text-muted-foreground">
            dados: {selectedData === "supabase" ? "supabase" : "demonstração"} · login:{" "}
            {selectedAuth === "supabase" ? "supabase" : "perfis fictícios"}
          </p>
        </div>
      )}

      <Separator />

      {/* Advanced: the two dimensions, independently */}
      <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-2 px-2 text-muted-foreground">
            <Icon
              icon="mdi:chevron-down"
              className={cn("size-4 transition-transform", advancedOpen && "rotate-180")}
            />
            Configuração avançada (2 dimensões)
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-3 space-y-4">
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="mb-2 flex items-center gap-2">
              <Icon icon="mdi:database-outline" className="size-4 text-muted-foreground" />
              <span className="text-sm font-medium">Origem dos dados</span>
            </div>
            <p className="mb-3 text-xs text-muted-foreground">
              De onde vêm clientes, pedidos, conversas e tudo mais.
            </p>
            <RadioGroup
              value={selectedData}
              onValueChange={(value) => setSelectedData(value as SourceMode)}
              className="gap-2"
              aria-label="Origem dos dados"
            >
              {(["supabase", "mock"] as const).map((mode) => (
                <div key={mode} className="flex items-center gap-2">
                  <RadioGroupItem id={`data-${mode}`} value={mode} />
                  <Label htmlFor={`data-${mode}`} className="text-sm font-normal">
                    {MODE_LABEL[mode].data}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          <div className="rounded-lg border border-border bg-card p-4">
            <div className="mb-2 flex items-center gap-2">
              <Icon icon="mdi:login-variant" className="size-4 text-muted-foreground" />
              <span className="text-sm font-medium">Forma de login</span>
            </div>
            <p className="mb-3 text-xs text-severity-warning">
              Trocar esta opção encerra a sessão atual — você precisará entrar de novo.
            </p>
            <RadioGroup
              value={selectedAuth}
              onValueChange={(value) => setSelectedAuth(value as SourceMode)}
              className="gap-2"
              aria-label="Forma de login"
            >
              {(["supabase", "mock"] as const).map((mode) => (
                <div key={mode} className="flex items-center gap-2">
                  <RadioGroupItem id={`auth-${mode}`} value={mode} />
                  <Label htmlFor={`auth-${mode}`} className="text-sm font-normal">
                    {MODE_LABEL[mode].auth}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Default vs override state */}
      {hasOverride ? (
        <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-severity-warning/30 bg-severity-warning/15 p-4 text-sm">
          <div className="flex min-w-0 items-start gap-3">
            <Icon
              icon="mdi:pencil-circle-outline"
              className="mt-0.5 size-4 shrink-0 text-severity-warning"
            />
            <p className="text-severity-warning">
              Você aplicou um ajuste manual <strong>neste navegador</strong>. O padrão do servidor é{" "}
              <strong>{PRESET_META[presetOf(envData, envAuth)].label}</strong>, mas você está
              rodando em <strong>{PRESET_META[activePreset].label}</strong>.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0 border-severity-warning/40 text-severity-warning hover:bg-severity-warning/10 hover:text-severity-warning"
            onClick={() => setConfirmRestore(true)}
            disabled={applying}
          >
            <Icon icon="mdi:restore" className="mr-1 size-4" />
            Voltar ao padrão do ambiente
          </Button>
        </div>
      ) : (
        <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
          <Icon icon="mdi:cog-outline" className="mt-0.5 size-4 shrink-0" />
          <p>
            Este navegador está usando a configuração padrão do servidor (
            <strong>{PRESET_META[presetOf(envData, envAuth)].label}</strong>). Nenhum ajuste manual
            foi aplicado.
          </p>
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button onClick={() => setConfirmOpen(true)} disabled={!dirty || applying}>
          <Icon icon="mdi:swap-horizontal" className="mr-1 size-4" />
          Aplicar alterações
        </Button>
        {dirty && !applying && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSelectedData(activeData);
              setSelectedAuth(activeAuth);
            }}
          >
            Descartar
          </Button>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        O ajuste vale apenas <strong>neste navegador</strong> e não muda nada para os demais
        usuários. A proteção dos dados reais (permissões e login) continua valendo independentemente
        do modo escolhido.
      </p>

      {/* Apply confirmation */}
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={(open) => {
          if (!applying) setConfirmOpen(open);
        }}
        targetPreset={selectedPreset}
        dataChanges={dataChanges}
        authChanges={authChanges}
        targetData={selectedData}
        applying={applying}
        onConfirm={() => apply(selectedData, selectedAuth)}
      />

      {/* Restore-default confirmation */}
      <ConfirmDialog
        open={confirmRestore}
        onOpenChange={(open) => {
          if (!applying) setConfirmRestore(open);
        }}
        targetPreset={presetOf(envData, envAuth)}
        dataChanges={envData !== activeData}
        authChanges={envAuth !== activeAuth}
        targetData={envData}
        applying={applying}
        restoreDefault
        onConfirm={() => apply(envData, envAuth)}
      />
    </div>
  );
}

function ConfirmDialog({
  open,
  onOpenChange,
  targetPreset,
  targetData,
  dataChanges,
  authChanges,
  applying,
  restoreDefault = false,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetPreset: EnvironmentPreset;
  targetData: SourceMode;
  dataChanges: boolean;
  authChanges: boolean;
  applying: boolean;
  restoreDefault?: boolean;
  onConfirm: () => void;
}) {
  const toProduction = targetPreset === "production";
  const title = restoreDefault
    ? "Voltar ao padrão do ambiente?"
    : targetPreset === "custom"
      ? dataChanges && !authChanges
        ? "Trocar a origem dos dados?"
        : "Trocar a forma de login?"
      : `Entrar no modo ${PRESET_META[targetPreset].label}?`;

  const actionLabel = restoreDefault
    ? "Voltar ao padrão"
    : targetPreset === "custom"
      ? "Aplicar"
      : `Entrar em ${PRESET_META[targetPreset].label}`;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm">
              <ul className="space-y-2">
                {dataChanges && (
                  <li className="flex items-start gap-2">
                    <Icon
                      icon={
                        targetData === "supabase" ? "mdi:database-outline" : "mdi:flask-outline"
                      }
                      className="mt-0.5 size-4 shrink-0"
                    />
                    <span>
                      {targetData === "supabase" ? (
                        <>
                          Os dados exibidos passam a ser os <strong>reais do seu banco</strong> —
                          não mais os fictícios de demonstração.
                        </>
                      ) : (
                        <>
                          Os dados exibidos passam a ser <strong>fictícios</strong> — nada do que
                          você fizer é salvo de verdade.
                        </>
                      )}
                    </span>
                  </li>
                )}
                {authChanges && (
                  <li className="flex items-start gap-2">
                    <Icon icon="mdi:logout" className="mt-0.5 size-4 shrink-0" />
                    <span>
                      Sua sessão atual será <strong>encerrada</strong> — você precisará entrar de
                      novo.
                    </span>
                  </li>
                )}
                <li className="flex items-start gap-2">
                  <Icon icon="mdi:refresh" className="mt-0.5 size-4 shrink-0" />
                  <span>
                    A página será <strong>recarregada</strong> para aplicar a mudança.
                  </span>
                </li>
              </ul>
              {!restoreDefault && toProduction && dataChanges && (
                <p>
                  Tudo o que você cadastrar a partir daqui é{" "}
                  <strong>permanente e visível para a sua equipe e clientes</strong>.
                </p>
              )}
              {!restoreDefault && targetPreset === "demo" && dataChanges && (
                <p>
                  Use este modo para treinar, testar ou apresentar a plataforma sem tocar nos dados
                  reais.
                </p>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={applying}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={applying}
            onClick={(event) => {
              // Keep the dialog mounted (pending state) while the reload kicks in.
              event.preventDefault();
              onConfirm();
            }}
          >
            {applying ? (
              <>
                <Icon icon="mdi:loading" className="mr-1 size-4 animate-spin" />
                Aplicando…
              </>
            ) : (
              actionLabel
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
