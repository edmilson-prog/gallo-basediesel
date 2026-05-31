import { useCallback, useMemo } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import {
  EMPTY_NOTIFICATION_FILTERS,
  filtersToSearch,
  readNotificationFilters,
  type INotificationFilters,
  type INotificationsSearch,
} from "../lib/notificationFilters";

export interface INotificationsUrlState {
  filters: INotificationFilters;
  setFilters: (next: INotificationFilters) => void;
  clear: () => void;
}

export function useNotificationsUrlState(): INotificationsUrlState {
  const search = useSearch({ from: "/app/notificacoes" }) as INotificationsSearch;
  const navigate = useNavigate({ from: "/app/notificacoes" });

  const filters = useMemo(() => readNotificationFilters(search), [search]);

  const setFilters = useCallback(
    (next: INotificationFilters) => {
      const s = filtersToSearch(next);
      void navigate({
        search: () => {
          const out: INotificationsSearch = {};
          if (s.status) out.status = s.status;
          if (s.categories) out.categories = s.categories;
          if (s.severities) out.severities = s.severities;
          return out;
        },
      });
    },
    [navigate],
  );

  const clear = useCallback(() => setFilters(EMPTY_NOTIFICATION_FILTERS), [setFilters]);

  return { filters, setFilters, clear };
}
