import { useNavigate } from "@tanstack/react-router";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Route } from "@/routes/app.configuracoes.ia";
import { useAiSettings } from "../hooks/useAiSettings";
import { AiMasterSwitch } from "../components/AiMasterSwitch";
import { AiOverviewTab } from "./AiOverviewTab";
import { AiProvidersTab } from "./AiProvidersTab";
import { AiFeaturesTab } from "./AiFeaturesTab";
import { AiPlaygroundTab } from "./AiPlaygroundTab";
import { AiSdrTab } from "./AiSdrTab";
import { AI_STRINGS } from "../i18n/pt-BR";

export function AiSettingsPage() {
  const navigate = useNavigate();
  const { aba } = Route.useSearch();
  const { settings, loading, reload } = useAiSettings();

  const setAba = (v: string) => {
    void navigate({ to: "/app/configuracoes/ia", search: { aba: v as typeof aba } });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{AI_STRINGS.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{AI_STRINGS.subtitle}</p>
        </div>
        {loading || !settings ? (
          <Skeleton className="h-8 w-28" />
        ) : (
          <AiMasterSwitch enabled={settings.masterEnabled} onChanged={reload} />
        )}
      </div>

      <Tabs value={aba} onValueChange={setAba}>
        <TabsList>
          <TabsTrigger value="visao-geral">{AI_STRINGS.tabs.overview}</TabsTrigger>
          <TabsTrigger value="provedores">{AI_STRINGS.tabs.providers}</TabsTrigger>
          <TabsTrigger value="funcionalidades">{AI_STRINGS.tabs.features}</TabsTrigger>
          <TabsTrigger value="playground">{AI_STRINGS.tabs.playground}</TabsTrigger>
          <TabsTrigger value="sdr">{AI_STRINGS.tabs.sdr}</TabsTrigger>
        </TabsList>
        <TabsContent value="visao-geral" className="mt-4">
          <AiOverviewTab />
        </TabsContent>
        <TabsContent value="provedores" className="mt-4">
          <AiProvidersTab />
        </TabsContent>
        <TabsContent value="funcionalidades" className="mt-4">
          <AiFeaturesTab />
        </TabsContent>
        <TabsContent value="playground" className="mt-4">
          <AiPlaygroundTab />
        </TabsContent>
        <TabsContent value="sdr" className="mt-4">
          <AiSdrTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
