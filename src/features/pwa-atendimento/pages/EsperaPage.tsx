import { useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { useAuth } from "@/features/auth/useAuth";
import { useTimeTick } from "@/features/conversations/hooks/useTimeTick";
import { PwaTopBar } from "../components/ui/PwaTopBar";
import { PwaTabBar } from "../components/ui/PwaTabBar";
import { PwaOfflineBar } from "../components/ui/PwaOfflineBar";
import { PwaConversationRow } from "../components/PwaConversationRow";
import { PwaQueueCounters } from "../components/PwaQueueCounters";
import { PwaAccountSheet } from "../components/sheets/PwaAccountSheet";
import { countQueue, pwaQueueListParams, sortQueue } from "../engine/queueOrder";
import { usePwaConversations, usePwaScope } from "../hooks/usePwaConversations";
import { useOnlineStatus } from "../hooks/useOnlineStatus";
import { PWA_ATENDIMENTO_STRINGS as S } from "../i18n/pt-BR";

export function EsperaPage() {
  const { currentUser } = useAuth();
  const { online, recheck } = useOnlineStatus();
  const scope = usePwaScope();
  const [accountOpen, setAccountOpen] = useState(false);

  const listParams = useMemo(() => pwaQueueListParams({ storeId: scope.storeId }), [scope.storeId]);
  const list = usePwaConversations(listParams);

  // One clock for the whole screen, so every counter moves together.
  const now = useTimeTick();

  const entries = useMemo(
    () =>
      sortQueue(
        list.items
          // A pool conversation always has `queuedAt`; guard anyway so a row
          // missing the trigger's stamp never renders a nonsense counter.
          .filter((item) => item.queuedAtMs !== null)
          .map((item) => ({
            conversation: item.conversation,
            waitMs: Math.max(0, now.getTime() - (item.queuedAtMs as number)),
            vm: item,
          })),
      ),
    [list.items, now],
  );

  const counters = useMemo(() => countQueue(entries), [entries]);

  return (
    <>
      <PwaTopBar
        title={S.queue.title}
        subtitle={S.queue.subtitle}
        online={online}
        userInitials={currentUser?.avatarInitials ?? "?"}
        onAccount={() => setAccountOpen(true)}
      />
      <PwaOfflineBar
        online={online}
        onRetry={() => {
          recheck();
          list.refetch();
        }}
      />
      <PwaQueueCounters counters={counters} />

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain">
        {list.isLoading && entries.length === 0 ? (
          <p
            aria-busy="true"
            className="flex items-center justify-center gap-2 px-6 py-14 text-xs text-muted-foreground"
          >
            <Icon icon="mdi:loading" size={16} className="animate-spin" />
            Carregando a fila…
          </p>
        ) : entries.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <Icon icon="mdi:check-circle-outline" size={26} className="text-severity-success" />
            <p className="mt-3 text-base font-extrabold text-foreground">{S.queue.empty}</p>
          </div>
        ) : (
          <>
            {entries.map((entry) => (
              <PwaConversationRow
                key={entry.conversation.id}
                item={entry.vm}
                assigneeLabel={null}
                waitMs={entry.waitMs}
                onOpen={list.markItemRead}
              />
            ))}
            <p className="px-3.5 pb-7 pt-4 text-center text-[11.5px] text-muted-foreground/70">
              {S.queue.legend}
            </p>
          </>
        )}
      </div>

      <PwaTabBar unreadCount={list.unreadConversations} queueCount={counters.total} />
      <PwaAccountSheet open={accountOpen} onOpenChange={setAccountOpen} online={online} />
    </>
  );
}
