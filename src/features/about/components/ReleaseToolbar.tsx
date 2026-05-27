import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Icon } from "@/components/Icon";
import type {
  IReleaseFilters,
  ReleaseKindFilter,
  ReleasePeriod,
} from "../hooks/useReleaseFilters";
import { ABOUT_I18N, RELEASE_KIND_LABEL } from "../i18n/pt-BR";

interface IProps {
  filters: IReleaseFilters;
  totalCount: number;
  filteredCount: number;
  onSearchChange: (value: string) => void;
  onKindChange: (value: ReleaseKindFilter) => void;
  onPeriodChange: (value: ReleasePeriod) => void;
}

export function ReleaseToolbar({
  filters,
  totalCount,
  filteredCount,
  onSearchChange,
  onKindChange,
  onPeriodChange,
}: IProps) {
  const showFiltered = filteredCount !== totalCount;

  return (
    <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
      <div className="relative flex-1">
        <Icon
          icon="mdi:magnify"
          size={16}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          type="search"
          value={filters.search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={ABOUT_I18N.history.searchPlaceholder}
          className="pl-9"
        />
      </div>

      <Select value={filters.kind} onValueChange={(v) => onKindChange(v as ReleaseKindFilter)}>
        <SelectTrigger className="w-full sm:w-[160px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{ABOUT_I18N.history.filterKindAll}</SelectItem>
          <SelectItem value="major">{RELEASE_KIND_LABEL.major}</SelectItem>
          <SelectItem value="minor">{RELEASE_KIND_LABEL.minor}</SelectItem>
          <SelectItem value="patch">{RELEASE_KIND_LABEL.patch}</SelectItem>
        </SelectContent>
      </Select>

      <Select value={filters.period} onValueChange={(v) => onPeriodChange(v as ReleasePeriod)}>
        <SelectTrigger className="w-full sm:w-[180px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{ABOUT_I18N.history.filterPeriodAll}</SelectItem>
          <SelectItem value="thisMonth">{ABOUT_I18N.history.filterPeriodThisMonth}</SelectItem>
          <SelectItem value="last3Months">
            {ABOUT_I18N.history.filterPeriodLast3Months}
          </SelectItem>
          <SelectItem value="thisYear">{ABOUT_I18N.history.filterPeriodThisYear}</SelectItem>
        </SelectContent>
      </Select>

      <div className="hidden text-xs text-muted-foreground sm:block">
        {showFiltered ? (
          <span>
            <strong className="font-semibold text-foreground">{filteredCount}</strong> de{" "}
            {totalCount} {ABOUT_I18N.history.countSuffix}
          </span>
        ) : (
          <span>
            <strong className="font-semibold text-foreground">{totalCount}</strong>{" "}
            {ABOUT_I18N.history.countSuffix}
          </span>
        )}
      </div>
    </div>
  );
}
