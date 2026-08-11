import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { shouldRetryQuery } from "./shared/lib/queryRetry";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      // TanStack retries 3 times by default. When the database is the thing
      // that failed, those extra attempts are what turn a slow query into an
      // outage: during the 2026-08-11 Inbox incident each timed-out request
      // became four, every one holding a connection for the full 8s
      // statement_timeout, until `remaining connection slots are reserved`.
      // See shared/lib/queryRetry — a saturated server gets no retry, anything
      // else gets one.
      queries: { retry: shouldRetryQuery },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
