import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { settlementsApi } from '@api/index';
import type { SettlementDetail, SettlementTab } from '@api/settlements.api';
import { queryKeys } from '@app/providers/queryClient';
import type { Settlement } from '@models/index';

/**
 * Settlement batches for one tab (Section 6.11: "Tabs: Pending / Settled").
 *
 * Each tab is cached under its own key so switching back and forth is instant and,
 * via React Query's persistence, readable offline — the "offline" state the
 * section requires.
 */
export function useSettlements(tab: SettlementTab): UseQueryResult<Settlement[], Error> {
  return useQuery({
    queryKey: queryKeys.settlements(tab),
    queryFn: async () => (await settlementsApi.listSettlements(tab)).items,
    // Settlement batches change at most a few times a day.
    staleTime: 2 * 60_000,
    placeholderData: (previous) => previous,
  });
}

/** One batch plus the transactions it contains (Section 6.12). */
export function useSettlement(id: string): UseQueryResult<SettlementDetail, Error> {
  return useQuery({
    queryKey: queryKeys.settlement(id),
    queryFn: () => settlementsApi.getSettlement(id),
  });
}

/**
 * Instant-settlement fee quote (Section 6.11 action).
 *
 * Only fetched when a sheet is actually open (`enabled`), and never cached: a
 * stale quote could show the merchant a fee that no longer applies, and this is a
 * figure they are consenting to.
 */
export function useInstantSettlementQuote(
  id: string | null,
  enabled: boolean,
): UseQueryResult<Awaited<ReturnType<typeof settlementsApi.getInstantSettlementQuote>>, Error> {
  return useQuery({
    queryKey: ['settlements', id ?? 'none', 'instant-quote'],
    queryFn: () => settlementsApi.getInstantSettlementQuote(id!),
    enabled: enabled && !!id,
    staleTime: 0,
    gcTime: 0,
  });
}
