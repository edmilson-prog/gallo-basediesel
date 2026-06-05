import { useState } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useCopilotChat } from "../hooks/useCopilotChat";
import { useCopilotViewMode } from "../hooks/useCopilotViewMode";
import { CopilotHeader } from "../components/CopilotHeader";
import { CopilotConversation } from "../components/CopilotConversation";
import { CopilotSessionList } from "../components/CopilotSessionList";
import { CopilotDetailPanel } from "../components/CopilotDetailPanel";

/**
 * Analytics copilot dedicated page (PRD-057 surface, multi-mode). A single
 * conversation core with acoplable wings: session list (Histórico) and detail
 * panel (Split). On mobile the wings become drawers. RNF-001 preserved upstream.
 */
export function AnalyticsCopilotPage() {
  const [mode, setMode] = useCopilotViewMode();
  const chat = useCopilotChat();
  const [sessionsSheetOpen, setSessionsSheetOpen] = useState(false);
  const [detailSheetOpen, setDetailSheetOpen] = useState(false);

  const showSessions = mode === "historico";
  const showDetail = mode === "split";

  const conversation = (
    <CopilotConversation messages={chat.messages} isThinking={chat.isThinking} onAsk={chat.ask} />
  );

  const sessionList = (
    <CopilotSessionList
      sessions={chat.sessions}
      activeSessionId={chat.activeSessionId}
      onSelect={(id) => {
        chat.selectSession(id);
        setSessionsSheetOpen(false);
      }}
      onNew={() => {
        chat.newSession();
        setSessionsSheetOpen(false);
      }}
      onDelete={chat.deleteSession}
    />
  );

  const detailPanel = <CopilotDetailPanel answer={chat.lastResolvedAnswer} />;

  return (
    <div className="flex h-[calc(100dvh-4rem)] flex-col md:h-[calc(100vh-4rem)]">
      <CopilotHeader
        mode={mode}
        onModeChange={setMode}
        onNewSession={chat.newSession}
        onOpenSessions={showSessions ? () => setSessionsSheetOpen(true) : undefined}
        onOpenDetail={showDetail ? () => setDetailSheetOpen(true) : undefined}
      />

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Left wing: session list (Histórico) — inline on md+ */}
        {showSessions && (
          <div className="hidden w-72 shrink-0 border-r border-border md:block">{sessionList}</div>
        )}

        {/* Conversation core (always present) */}
        <div className="flex min-w-0 flex-1 flex-col">{conversation}</div>

        {/* Right wing: detail panel (Split) — inline only on xl+ */}
        {showDetail && (
          <aside className="hidden w-[360px] shrink-0 border-l border-border xl:block">
            {detailPanel}
          </aside>
        )}
      </div>

      {/* Mobile / md drawers */}
      <Sheet open={sessionsSheetOpen} onOpenChange={setSessionsSheetOpen}>
        <SheetContent side="left" className="w-80 p-0">
          {sessionList}
        </SheetContent>
      </Sheet>
      <Sheet open={detailSheetOpen} onOpenChange={setDetailSheetOpen}>
        <SheetContent side="right" className={cn("w-[360px] max-w-full p-0")}>
          {detailPanel}
        </SheetContent>
      </Sheet>
    </div>
  );
}
