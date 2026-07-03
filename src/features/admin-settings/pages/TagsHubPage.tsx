import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConversationTagsSettingsTab } from "./ConversationTagsSettingsTab";
import { TagsSettingsPage } from "./TagsSettingsPage";

/**
 * Two-tab tags hub: conversation tags (new, Owner-only writes) and the
 * pre-existing customer tag catalog page mounted untouched as the second tab
 * (its own Owner+Gestor gate stays as-is).
 */
export function TagsHubPage() {
  return (
    <Tabs defaultValue="conversas" className="space-y-4">
      <TabsList>
        <TabsTrigger value="conversas">Tags de conversa</TabsTrigger>
        <TabsTrigger value="clientes">Tags de cliente</TabsTrigger>
      </TabsList>
      <TabsContent value="conversas" className="focus-visible:outline-none">
        <ConversationTagsSettingsTab />
      </TabsContent>
      <TabsContent value="clientes" className="focus-visible:outline-none">
        <TagsSettingsPage />
      </TabsContent>
    </Tabs>
  );
}
