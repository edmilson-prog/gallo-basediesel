import { useEffect } from "react";
import { Icon } from "@/components/Icon";
import type { FunnelLayout } from "../engine/resolveLayout";
import { ALL_FUNNELS } from "../engine/resolveInitialFunnel";
import { COPY } from "../i18n/pt-BR";
import { useFunnelNavigation } from "../hooks/useFunnelNavigation";
import { FunnelRail } from "./FunnelRail";
import { FunnelSwitcher } from "./FunnelSwitcher";
import { FunnelTabs } from "./FunnelTabs";
import type { IFunnelViewProps } from "./types";

export interface IFunnelNavProps {
  /** Render only when the resolved layout matches, so the page can place each
   *  pattern in its own slot (rail beside the board, tabs under the header,
   *  switcher inside it) while exactly one is ever mounted. */
  slot: FunnelLayout;
  canManage: boolean;
  onCreate: () => void;
}

/**
 * Chooses the projection and owns everything that is not presentation.
 *
 * The [ and ] shortcuts live here rather than in each view: they belong to the
 * parity contract, and duplicating them three times is how one pattern ends up
 * with a feature the others lack.
 */
export function FunnelNav({ slot, canManage, onCreate }: IFunnelNavProps) {
  const {
    funnels,
    countsByFunnel,
    activeFunnelId,
    setActiveFunnel,
    preferredLayout,
    setPreferredLayout,
    resolved,
    isLoading,
  } = useFunnelNavigation();

  useEffect(() => {
    // Bind once, from the mounted slot only.
    if (resolved.layout !== slot) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "[" && e.key !== "]") return;
      if (e.defaultPrevented) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (activeFunnelId === null || activeFunnelId === ALL_FUNNELS) return;
      const i = funnels.findIndex((f) => f.id === activeFunnelId);
      if (i < 0) return;
      e.preventDefault();
      const delta = e.key === "]" ? 1 : -1;
      const next = funnels[(i + delta + funnels.length) % funnels.length];
      if (next) setActiveFunnel(next.id);
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [resolved.layout, slot, funnels, activeFunnelId, setActiveFunnel]);

  if (resolved.layout !== slot) return null;
  if (isLoading) return null;

  if (resolved.isEmpty) {
    // Only reachable for a non-staff user with no granted funnel — impossible
    // in v1, where the default funnel is unrestricted. Handled anyway so the
    // page degrades to an explanation instead of an empty chrome.
    return (
      <div className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground">
        <Icon icon="mdi:filter-remove-outline" size={16} aria-hidden />
        <span>
          <strong className="font-medium text-foreground">{COPY.emptyTitle}</strong> — {COPY.emptyBody}
        </span>
      </div>
    );
  }

  const viewProps: IFunnelViewProps = {
    funnels,
    countsByFunnel,
    activeFunnelId,
    onSelect: setActiveFunnel,
    // The engine says `railCollapsed` because only the rail can collapse; the
    // view prop is plain `collapsed` because a view must not know which of the
    // three it is. Same value, deliberately different name.
    collapsed: resolved.railCollapsed,
    staticLabel: resolved.staticLabel,
    canManage,
    onCreate,
    preferredLayout,
    onPreferredLayoutChange: setPreferredLayout,
  };

  // In "header" the switcher trigger IS the page heading. In the other two the
  // page would otherwise have no <h1> naming the active funnel (spec 6.7), so
  // one is provided invisibly rather than duplicating a visible title.
  const active = funnels.find((f) => f.id === activeFunnelId);
  const headingText =
    activeFunnelId === ALL_FUNNELS ? COPY.allFunnels : (active?.name ?? COPY.sectionLabel);
  const heading = <h1 className="sr-only">{headingText}</h1>;

  if (resolved.layout === "rail") {
    return (
      <>
        {heading}
        <FunnelRail {...viewProps} />
      </>
    );
  }
  if (resolved.layout === "tabs") {
    return (
      <>
        {heading}
        <FunnelTabs {...viewProps} />
      </>
    );
  }
  return <FunnelSwitcher {...viewProps} />;
}
