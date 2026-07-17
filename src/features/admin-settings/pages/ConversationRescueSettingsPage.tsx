import { useCurrentStore } from "@/features/multistore";
import { ConversationRescueSettingsSection } from "@/features/conversation-rescue";
import { SectionHeader } from "../components/SectionHeader";

export function ConversationRescueSettingsPage() {
  const { currentStoreId } = useCurrentStore();
  const storeId = currentStoreId ?? "00000000-0000-0000-0000-000000000001";

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Resgate de conversas"
        description="Oferece a conversa a outro atendente online quando o responsável está ausente; força uma atribuição se ninguém assumir."
      />
      <ConversationRescueSettingsSection storeId={storeId} />
    </div>
  );
}
