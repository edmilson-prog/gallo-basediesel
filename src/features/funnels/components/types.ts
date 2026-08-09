import type { ID, ILeadFunnel } from "@/shared/types";
import type { FunnelLayout } from "../engine/resolveLayout";
import type { ALL_FUNNELS } from "../engine/resolveInitialFunnel";

export type ActiveFunnel = ID | typeof ALL_FUNNELS | null;

/**
 * Every navigation projection takes exactly this, and nothing more.
 *
 * The parity contract of spec 6.2 lives in this type: if a pattern cannot
 * offer something here, the answer is to drop it from all three — not to widen
 * one view's props. A prop that only one view reads is the first step towards
 * three components that quietly do different things.
 */
export interface IFunnelViewProps {
  funnels: ILeadFunnel[];
  countsByFunnel: Record<ID, number>;
  activeFunnelId: ActiveFunnel;
  onSelect: (id: ID | typeof ALL_FUNNELS) => void;
  /** Rail only; the other two ignore it. */
  collapsed: boolean;
  /** Single funnel: render a static label instead of a chooser. */
  staticLabel: boolean;
  canManage: boolean;
  onCreate: () => void;
  preferredLayout: FunnelLayout;
  onPreferredLayoutChange: (l: FunnelLayout) => void;
}
