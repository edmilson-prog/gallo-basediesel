import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SharedSnippetsManager } from "./SharedSnippetsManager";
import { AssetUsageStatsPage } from "./AssetUsageStatsPage";
import { AssetLibraryManagerPage } from "./AssetLibraryManagerPage";
import { QUICK_SEND_STRINGS } from "../../i18n/pt-BR";

export type ILibraryManagerPageProps = Record<string, never>;

/**
 * Library governance hub (D-12/D-13). Tabs: Ativos (→ AssetLibraryManagerPage),
 * Respostas rápidas (→ SharedSnippetsManager), Uso (→ AssetUsageStatsPage).
 *
 * The section header and asset management UI now live in AssetLibraryManagerPage
 * so each tab renders its own self-contained page.
 */
export function LibraryManagerPage(_: ILibraryManagerPageProps) {
  const s = QUICK_SEND_STRINGS.library;

  return (
    <Tabs defaultValue="assets">
      <TabsList>
        <TabsTrigger value="assets">{s.tabAssets}</TabsTrigger>
        <TabsTrigger value="snippets">{s.tabSnippets}</TabsTrigger>
        <TabsTrigger value="usage">{s.tabUsage}</TabsTrigger>
      </TabsList>

      <TabsContent value="assets" className="mt-6">
        <AssetLibraryManagerPage />
      </TabsContent>

      <TabsContent value="snippets" className="mt-6">
        <SharedSnippetsManager />
      </TabsContent>

      <TabsContent value="usage" className="mt-6">
        <AssetUsageStatsPage />
      </TabsContent>
    </Tabs>
  );
}
