import { Link } from "@tanstack/react-router";
import { Icon } from "@/components/Icon";
import { PREVIEW_TOKEN } from "../pages/NpsSurveyPublicPage";

/**
 * The six tabs of /app/nps — the kit's `NpsTabs` (`nps-shell.jsx`).
 *
 * The badge on "Recuperação" is the reason this bar exists rather than six
 * separate menu entries: the count of untreated detractors has to be visible
 * from whichever tab you happen to be on, because nobody navigates to a queue
 * they have no reason to suspect is filling up.
 */

export const NPS_TABS = [
  { key: "painel", label: "Painel", icon: "lucide:gauge" },
  { key: "respostas", label: "Respostas", icon: "lucide:message-square-quote" },
  { key: "recuperacao", label: "Recuperação", icon: "lucide:life-buoy" },
  { key: "envio", label: "Envio", icon: "lucide:send" },
  { key: "parametros", label: "Parâmetros", icon: "lucide:sliders-horizontal" },
  { key: "embutidos", label: "Embutidos", icon: "lucide:layout-dashboard" },
] as const;

export type INpsTab = (typeof NPS_TABS)[number]["key"];

const TAB_KEYS = NPS_TABS.map((tab) => tab.key) as readonly string[];

/** Falls back to the panel, so a hand-typed or stale `?aba=` never blanks the screen. */
export function parseNpsTab(raw: unknown): INpsTab {
  return typeof raw === "string" && TAB_KEYS.includes(raw) ? (raw as INpsTab) : "painel";
}

export function NpsTabsBar({
  tab,
  onTab,
  openRecoveries,
}: {
  tab: INpsTab;
  onTab: (tab: INpsTab) => void;
  openRecoveries: number;
}) {
  return (
    // Negative margins cancel DashboardLayout's padding so the rule underneath
    // reaches the full width, then the same padding is re-applied inside to
    // keep the tabs aligned with the content above them. Both halves have to
    // move together with the layout's px-4 / md:px-8.
    <div className="sticky top-0 z-40 -mx-4 mb-4 flex items-stretch gap-0 overflow-x-auto border-b border-border bg-background/85 px-4 backdrop-blur md:-mx-8 md:px-8">
      {NPS_TABS.map((item) => {
        const active = item.key === tab;
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onTab(item.key)}
            aria-current={active ? "page" : undefined}
            className={`inline-flex shrink-0 items-center gap-2 border-b-2 px-4 pb-2.5 pt-3.5 text-[13.5px] transition-colors ${
              active
                ? "border-primary font-bold text-foreground"
                : "border-transparent font-semibold text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon
              icon={item.icon}
              size={16}
              className={active ? "text-primary" : "text-muted-foreground/70"}
            />
            {item.label}
            {item.key === "recuperacao" && openRecoveries > 0 ? (
              <span className="rounded-full bg-severity-critical px-1.5 py-px text-[9.5px] font-extrabold text-white">
                {openRecoveries}
              </span>
            ) : null}
          </button>
        );
      })}

      <Link
        to="/pesquisa/$token"
        params={{ token: PREVIEW_TOKEN }}
        target="_blank"
        rel="noopener noreferrer"
        className="ml-auto hidden shrink-0 items-center gap-1.5 self-center pl-3.5 text-[12.5px] font-bold text-primary hover:underline lg:inline-flex"
      >
        Ver a pesquisa do cliente
        <Icon icon="lucide:external-link" size={14} />
      </Link>
    </div>
  );
}
