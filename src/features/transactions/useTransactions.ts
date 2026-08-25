import { useInfiniteQuery, type UseInfiniteQueryResult, type InfiniteData } from '@tanstack/react-query';
import { transactionsApi } from '@api/index';
import type { Paginated, TransactionFilter } from '@models/api';
import type { Transaction } from '@models/index';
import type { DateRange } from '@components/index';

const PAGE_SIZE = 20;

export interface TransactionsQueryArgs {
  filter: TransactionFilter;
  search: string;
  range: DateRange;
}

/**
 * Cursor-paginated transactions list (Section 6.8: "Pagination: infinite scroll").
 *
 * `GET /transactions` returns an opaque `nextCursor`, which `getNextPageParam`
 * forwards verbatim — the client never derives or reconstructs it, so the server
 * is free to change its pagination scheme without a client release.
 *
 * The query key includes the filter, search text and date range, so each
 * combination is cached separately: flipping back to a previously-viewed filter is
 * instant rather than re-fetching. React Query's persistence then makes those
 * cached pages readable offline, which is what satisfies the "offline (cached)"
 * state in Section 6.8.
 */
export function useTransactions({
  filter,
  search,
  range,
}: TransactionsQueryArgs): UseInfiniteQueryResult<InfiniteData<Paginated<Transaction>>, Error> {
  const from = range.from ? range.from.toISOString() : undefined;
  const to = range.to ? range.to.toISOString() : undefined;

  return useInfiniteQuery({
    // `range.preset` alone is insufficient — a custom range needs its bounds in
    // the key, or two different custom windows would share a cache entry.
    queryKey: ['transactions', filter, search, range.preset, from ?? '', to ?? ''],
    queryFn: ({ pageParam }) =>
      transactionsApi.listTransactions({
        filter,
        search,
        cursor: pageParam,
        limit: PAGE_SIZE,
        ...(from ? { from } : {}),
        ...(to ? { to } : {}),
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    // Keeps the previous list visible while a new filter loads, so the screen does
    // not flash empty on every chip tap.
    placeholderData: (previous) => previous,
  });
}

/** Flattens the paged result into a single list for the FlatList. */
export function flattenTransactions(
  data: InfiniteData<Paginated<Transaction>> | undefined,
): Transaction[] {
  return data?.pages.flatMap((page) => page.items) ?? [];
}

export { PAGE_SIZE };
