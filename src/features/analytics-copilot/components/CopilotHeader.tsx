import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import type { CopilotViewMode } from "../hooks/useCopilotViewMode";
import { CopilotViewSwitcher } from "./CopilotViewSwitcher";

interface ICopilotHeaderProps {
  mode: CopilotViewMode;
  onModeChange: (mode: CopilotViewMode) => void;
  onNewSession: () => void;
  /** Mobile drawer openers (rendered only when relevant). */
  onOpenSessions?: () => void;
  onOpenDetail?: () => void;
}

/** Sticky glass header: title + Beta badge + view switcher + "Nova conversa".
 *  On mobile, exposes drawer openers for sessions/detail. */
export function CopilotHeader({
  mode,
  onModeChange,
  onNewSession,
  onOpenSessions,
  onOpenDetail,
}: ICopilotHeaderProps) {
  return (
    <header className="sticky top-0 z-10 border-b border-border/60 bg-background/80 px-4 py-3 backdrop-blur-xl backdrop-saturate-150 supports-[backdrop-filter]:bg-background/65">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon icon="mdi:robot-happy-outline" size={20} />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-base font-semibold tracking-tight text-foreground">
                Copiloto analítico
              </h1>
              <span className="hidden rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground sm:inline">
                Beta · baseado em regras
              </span>
            </div>
            <p className="hidden truncate text-xs text-muted-foreground sm:block">
              Pergunte sobre faturamento, margem, clientes…
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Mobile drawer openers */}
          {onOpenSessions && (
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={onOpenSessions}
              aria-label="Conversas"
            >
              <Icon icon="mdi:history" size={18} />
            </Button>
          )}
          {onOpenDetail && (
            <Button
              variant="ghost"
              size="icon"
              className="xl:hidden"
              onClick={onOpenDetail}
              aria-label="Detalhe da resposta"
            >
              <Icon icon="mdi:dock-right" size={18} />
            </Button>
          )}

          <CopilotViewSwitcher mode={mode} onChange={onModeChange} />

          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5"
            onClick={onNewSession}
            aria-label="Nova conversa"
          >
            <Icon icon="mdi:plus" size={18} />
            <span className="hidden sm:inline">Nova</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
