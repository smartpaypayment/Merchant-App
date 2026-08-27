import { useMemo } from 'react';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { reportsApi } from '@api/index';
import { queryKeys } from '@app/providers/queryClient';
import type { ReportsResponse } from '@models/api';
import { addDays, endOfDay, startOfDay } from '@utils/date';
import type { DateRange } from '@components/index';

/**
 * Report aggregates for a date range (Section 6.13: `GET /reports?from=&to=`).
 *
 * An "All time" selection has no bounds, so it is resolved to a wide window rather
 * than sending no dates: the endpoint's own default is only the last 7 days, which
 * would silently disagree with the range chip the merchant selected.
 */
const ALL_TIME_LOOKBACK_DAYS = 365;

export function resolveReportRange(range: DateRange): { from: string; to: string } {
  const to = range.to ?? endOfDay(new Date());
  const from = range.from ?? startOfDay(addDays(new Date(), -ALL_TIME_LOOKBACK_DAYS));

  return { from: from.toISOString(), to: to.toISOString() };
}

export function useReports(range: DateRange): UseQueryResult<ReportsResponse, Error> {
  const { from, to } = useMemo(() => resolveReportRange(range), [range]);

  return useQuery({
    queryKey: queryKeys.reports(from, to),
    queryFn: () => reportsApi.getReports(from, to),
    // Aggregates over a past range barely change; today's range changes slowly.
    staleTime: 2 * 60_000,
    placeholderData: (previous) => previous,
  });
}
