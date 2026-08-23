import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { dashboardApi } from '@api/index';
import { queryKeys } from '@app/providers/queryClient';
import type { DashboardSummary } from '@models/index';

/**
 * Home dashboard data (Section 6.5: `GET /dashboard/summary`).
 *
 * The endpoint already returns the last 5 transactions inside the summary, so a
 * separate `GET /transactions?limit=5` is not issued — one round-trip instead of
 * two matters on the 2G/3G connections in Section 5.7.
 *
 * `placeholderData` keeps the previous summary on screen during a refetch so
 * pull-to-refresh does not blank the card the merchant is reading.
 */
export function useDashboard(): UseQueryResult<DashboardSummary, Error> {
  return useQuery({
    queryKey: queryKeys.dashboard,
    queryFn: dashboardApi.getDashboardSummary,
    placeholderData: (previous) => previous,
    // Collections change constantly through the day; a short stale window keeps
    // the figure honest without hammering the API.
    staleTime: 30_000,
  });
}
