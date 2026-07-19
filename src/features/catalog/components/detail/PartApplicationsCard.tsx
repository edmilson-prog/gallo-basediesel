import type { IPart } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { CATALOG_STRINGS } from "../../i18n/pt-BR";
import { ApplicationsEditor } from "../form/ApplicationsEditor";
import type { IPartDraft } from "../../utils/draft";

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
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <Icon icon="mdi:truck-outline" size={16} className="text-muted-foreground" />
        <h2 className="text-sm font-semibold tracking-tight text-foreground">
          {CATALOG_STRINGS.detail.sections.applications}
        </h2>
        <span className="ml-auto inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
          {COPY.vehicles(apps.length)}
        </span>
      </div>

      <div className="space-y-2">
        {apps.slice(0, MAX_COMPACT).map((app) => (
          <div
            key={app.id}
            className="flex items-center gap-3 rounded-md border border-border bg-muted/30 px-3 py-2"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted">
              <Icon icon="mdi:truck-outline" size={15} className="text-muted-foreground" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-foreground">
                <span className="font-semibold">{app.vehicleBrand}</span>{" "}
                <span className="text-muted-foreground">{app.vehicleModel}</span>
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {app.engine ? COPY.engine(app.engine) : ""}
                {app.engine ? " · " : ""}
                {CATALOG_STRINGS.detail.applications.yearsRange(app.yearStart, app.yearEnd)}
              </p>
            </div>
          </div>
        ))}
      </div>

      {apps.length > MAX_COMPACT && (
        <button
          type="button"
          onClick={onViewAll}
          className="mt-2 w-full cursor-pointer rounded-md border border-border py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
        >
          {COPY.viewAllApplications(apps.length)}
        </button>
      )}
    </div>
  );
}
