import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, radius, spacing, typography, MIN_TOUCH_TARGET } from '@theme/index';
import {
  ALL_TIME_RANGE,
  DateRangePicker,
  EmptyState,
  ErrorState,
  FilterChips,
  ListSkeleton,
  Screen,
  TextField,
  TransactionRow,
  type DateRange,
  type FilterChipOption,
} from '@components/index';
import { useNetworkStatus } from '@hooks/useNetworkStatus';
import { useDebouncedValue } from '@hooks/useDebouncedValue';
import type { TransactionFilter } from '@models/api';
import type { Transaction } from '@models/index';
import { relativeDayKey, dateParts, toDateKey } from '@utils/date';
import type { TransactionsStackParamList } from '@app/navigation/types';
import { flattenTransactions, useTransactions } from './useTransactions';

type Nav = NativeStackNavigationProp<TransactionsStackParamList, 'TransactionsList'>;

/** Section 6.8 filter chips: All / Success / Pending / Failed / Refunded. */
const FILTERS: readonly TransactionFilter[] = ['all', 'success', 'pending', 'failed', 'refunded'];

/** A day header, or a transaction. Flattened so one FlatList renders both. */
type Row = { kind: 'header'; key: string; label: string } | { kind: 'txn'; key: string; txn: Transaction };

/**
 * Section 6.8 Transactions List Screen.
 *
 * Search bar, filter chips, date-range filter, infinite scroll, and the four
 * required states.
 *
 * Rows are grouped under day headers ("Today", "Yesterday", then dates). The
 * grouped rows are flattened into a single `FlatList` rather than using
 * `SectionList`: sections would need the server to return complete days, but
 * cursor pagination can split a day across two pages, which produces duplicate
 * section headers. Flattening lets us insert headers correctly as pages arrive.
 */
export function TransactionsListScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<Nav>();
  const { isOnline } = useNetworkStatus();

  const [filter, setFilter] = useState<TransactionFilter>('all');
  const [searchInput, setSearchInput] = useState('');
  const [range, setRange] = useState<DateRange>(ALL_TIME_RANGE);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Debounced so typing an amount does not fire a request per keystroke — which
  // on a 2G connection would queue requests faster than they resolve.
  const search = useDebouncedValue(searchInput, 350);

  const query = useTransactions({ filter, search, range });
  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isFetching,
  } = query;

  const transactions = useMemo(() => flattenTransactions(data), [data]);

  /** Interleaves day headers between transactions. */
  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    let lastDayKey: string | null = null;

    for (const txn of transactions) {
      const dayKey = toDateKey(txn.createdAt);

      if (dayKey !== lastDayKey) {
        const relative = relativeDayKey(txn.createdAt);
        const { day, monthKey, year } = dateParts(txn.createdAt);
        out.push({
          kind: 'header',
          key: `h_${dayKey}`,
          label: relative ? t(relative) : `${day} ${t(monthKey)} ${year}`,
        });
        lastDayKey = dayKey;
      }

      out.push({ kind: 'txn', key: txn.id, txn });
    }

    return out;
  }, [transactions, t]);

  const filterOptions: FilterChipOption<TransactionFilter>[] = FILTERS.map((value) => ({
    value,
    label: t(`transactions.filters.${value}`),
  }));

  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await refetch();
    } finally {
      setIsRefreshing(false);
    }
  }, [refetch]);

  const openDetail = useCallback(
    (txn: Transaction) => navigation.navigate('TransactionDetail', { id: txn.id }),
    [navigation],
  );

  const clearFilters = useCallback(() => {
    setFilter('all');
    setSearchInput('');
    setRange(ALL_TIME_RANGE);
  }, []);

  const hasActiveFilters = filter !== 'all' || search !== '' || range.preset !== 'all';

  const renderRow = useCallback(
    ({ item }: { item: Row }) => {
      if (item.kind === 'header') {
        return (
          <View style={styles.dayHeader}>
            <Text style={styles.dayHeaderText}>{item.label}</Text>
          </View>
        );
      }
      return (
        <View style={styles.rowWrapper}>
          <TransactionRow transaction={item.txn} onPress={openDetail} />
        </View>
      );
    },
    [openDetail],
  );

  /* ------------------------------- states -------------------------------- */

  const showInitialSkeleton = isLoading && transactions.length === 0;
  // Only a hard failure with nothing cached should take over the screen.
  const showErrorState = isError && transactions.length === 0;
  const showEmptyState = !isLoading && !isError && transactions.length === 0;

  return (
    <Screen padded={false} testID="transactions-list-screen">
      <View style={styles.header}>
        <Text style={styles.title}>{t('transactions.title')}</Text>
        <DateRangePicker value={range} onChange={setRange} testID="transactions-date-range" />
      </View>

      <View style={styles.searchWrapper}>
        <TextField
          label=""
          placeholder={t('transactions.searchPlaceholder')}
          value={searchInput}
          onChangeText={setSearchInput}
          iconRight="search"
          returnKeyType="search"
          autoCorrect={false}
          containerStyle={styles.searchField}
          testID="transactions-search"
        />
      </View>

      <FilterChips
        options={filterOptions}
        value={filter}
        onChange={setFilter}
        testID="transactions-filter"
      />

      {/* Result count doubles as a subtle "the filter did something" signal. */}
      {transactions.length > 0 ? (
        <View style={styles.countRow}>
          <Text style={styles.countText}>
            {t('transactions.resultCount', { count: transactions.length })}
          </Text>
          {isFetching && !isRefreshing && !isFetchingNextPage ? (
            <ActivityIndicator size="small" color={colors.textTertiary} />
          ) : null}
        </View>
      ) : null}

      {showInitialSkeleton ? (
        <ListSkeleton count={7} />
      ) : showErrorState ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : showEmptyState ? (
        <EmptyState
          icon={hasActiveFilters ? 'funnel-outline' : 'receipt-outline'}
          title={hasActiveFilters ? t('transactions.emptyFilteredTitle') : t('transactions.emptyTitle')}
          body={hasActiveFilters ? t('transactions.emptyFilteredBody') : t('transactions.emptyBody')}
          {...(hasActiveFilters
            ? { ctaLabel: t('transactions.clearFilters'), onCtaPress: clearFilters }
            : {})}
        />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(row) => row.key}
          renderItem={renderRow}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => void onRefresh()}
              colors={[colors.primary]}
              tintColor={colors.primary}
            />
          }
          onEndReached={() => {
            // Guard on `isFetchingNextPage`: FlatList can fire this repeatedly
            // during a fast scroll, which would launch duplicate page requests.
            if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
          }}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            isFetchingNextPage ? (
              <View style={styles.footer}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={styles.footerText}>{t('transactions.loadingMore')}</Text>
              </View>
            ) : !hasNextPage && transactions.length > PAGE_HINT_THRESHOLD ? (
              <View style={styles.footer}>
                <Text style={styles.footerText}>{t('transactions.endOfList')}</Text>
              </View>
            ) : null
          }
          // Tuned for low-end devices (Section 2): render less per batch and keep
          // fewer offscreen rows resident.
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={7}
          removeClippedSubviews
        />
      )}

      {!isOnline && transactions.length > 0 ? (
        <View style={styles.offlineFooter}>
          <Ionicons name="cloud-offline-outline" size={14} color={colors.textTertiary} />
          <Text style={styles.offlineFooterText}>{t('network.offlineBanner')}</Text>
        </View>
      ) : null}
    </Screen>
  );
}

/** Only show "that's everything" once the list is long enough for it to be news. */
const PAGE_HINT_THRESHOLD = 8;

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
  },
  title: { ...typography.heading, color: colors.text, flexShrink: 1 },
  searchWrapper: { paddingHorizontal: spacing.md, paddingTop: spacing.xs },
  searchField: { marginBottom: 0 },
  countRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xxs,
  },
  countText: { ...typography.caption, color: colors.textTertiary },
  listContent: { paddingBottom: spacing.xl },
  dayHeader: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxs,
    backgroundColor: colors.background,
  },
  dayHeaderText: { ...typography.captionMedium, color: colors.textSecondary },
  rowWrapper: {
    marginHorizontal: spacing.md,
    borderRadius: radius.md,
    overflow: 'hidden',
    marginBottom: 1,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    minHeight: MIN_TOUCH_TARGET,
    paddingVertical: spacing.md,
  },
  footerText: { ...typography.caption, color: colors.textTertiary },
  offlineFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xxs,
    paddingVertical: spacing.xs,
    backgroundColor: colors.surfaceAlt,
  },
  offlineFooterText: { ...typography.caption, color: colors.textTertiary },
});
