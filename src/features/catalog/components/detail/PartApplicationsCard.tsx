import type { IPart } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { CATALOG_STRINGS } from "../../i18n/pt-BR";
import { ApplicationsEditor } from "../form/ApplicationsEditor";
import type { IPartDraft } from "../../utils/draft";
import { PartChip } from "./PartChip";
import { PartPanel } from "./PartPanel";

const COPY = CATALOG_STRINGS.detail.counterCards;

/** Max fitment rows shown before collapsing behind "Ver todas". */
const MAX_COMPACT = 3;

export interface IPartApplicationsCardProps {
  part: IPart;
  /** Jump to the full "Aplicações" tab. */
  onViewAll: () => void;
  editing?: boolean;
  draft?: IPartDraft;
  onDraftChange?: (patch: Partial<IPartDraft>) => void;
}

/**
 * Compact fitment card pinned to the counter layout's left column (design kit
 * `CatApps`) — critical at the sales counter, so it must not hide behind a tab.
 */
export function PartApplicationsCard({
  part,
  onViewAll,
  editing = false,
  draft,
  onDraftChange,
}: IPartApplicationsCardProps) {
  if (editing && draft && onDraftChange) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="mb-3 flex items-center gap-2">
          <Icon icon="mdi:truck-outline" size={16} className="text-muted-foreground" />
          <h2 className="text-sm font-semibold tracking-tight text-foreground">
            {CATALOG_STRINGS.detail.sections.applications}
          </h2>
        </div>
        <ApplicationsEditor
          applications={draft.applications}
          onChange={(next) => onDraftChange({ applications: next })}
        />
      </div>
    );
  }

  const apps = part.applications;
  if (apps.length === 0) return null;

  return (
    <PartPanel
      title={CATALOG_STRINGS.detail.sections.applications}
      icon="mdi:truck-outline"
      right={
        <PartChip tone="info" size="sm">
          {COPY.vehicles(apps.length)}
        </PartChip>
      }
    >
      <ul className="flex flex-col gap-2">
        {apps.slice(0, MAX_COMPACT).map((app) => (
          <li
            key={app.id}
            className="flex items-center gap-3 rounded-[9px] border border-border bg-muted/30 px-3 py-2.5"
          >
            <span className="grid size-8 shrink-0 place-items-center rounded-md bg-muted">
              <Icon icon="mdi:truck-outline" size={16} className="text-muted-foreground" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13.5px] text-foreground">
                <span className="font-semibold">{app.vehicleBrand}</span>{" "}
                <span className="text-muted-foreground">{app.vehicleModel}</span>
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {app.engine ? COPY.engine(app.engine) : ""}
                {app.engine ? " · " : ""}
                {CATALOG_STRINGS.detail.applications.yearsRange(app.yearStart, app.yearEnd)}
              </p>
            </div>
          </li>
        ))}
      </ul>

      {apps.length > MAX_COMPACT && (
        <button
          type="button"
          onClick={onViewAll}
          className="mt-2 w-full cursor-pointer rounded-lg border border-border py-2.5 text-[12.5px] font-semibold text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
        >
          {COPY.viewAllApplications(apps.length)}
        </button>
      )}
    </PartPanel>
  );
}
