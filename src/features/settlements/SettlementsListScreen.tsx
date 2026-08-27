import { useCallback, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, radius, spacing, typography } from '@theme/index';
import {
  EmptyState,
  ErrorState,
  FilterChips,
  ListSkeleton,
  Screen,
  type FilterChipOption,
} from '@components/index';
import type { SettlementTab } from '@api/settlements.api';
import { useNetworkStatus } from '@hooks/useNetworkStatus';
import type { Settlement } from '@models/index';
import { track } from '@utils/analytics';
import type { SettlementsStackParamList } from '@app/navigation/types';
import { useSettlements } from './useSettlements';
import { InstantSettleSheet } from './InstantSettleSheet';
import { SettlementRow } from './SettlementRow';

type Nav = NativeStackNavigationProp<SettlementsStackParamList, 'SettlementsList'>;

/**
 * Section 6.11 Settlements List Screen.
 *
 * Pending / Settled tabs, each row showing amount, date, status, UTR (settled) and
 * transaction count. Handles loading, empty, error and offline states.
 *
 * "Instant settle" is surfaced on the pending rows rather than as a screen-level
 * action, because it applies to a specific batch — a global button would leave the
 * merchant guessing which money it moves.
 */
export function SettlementsListScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<Nav>();
  const { isOnline } = useNetworkStatus();

  const [tab, setTab] = useState<SettlementTab>('pending');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [instantTarget, setInstantTarget] = useState<Settlement | null>(null);

  const { data, isLoading, isError, error, refetch } = useSettlements(tab);
  const settlements = data ?? [];

  const tabs: FilterChipOption<SettlementTab>[] = [
    { value: 'pending', label: t('settlements.tabs.pending') },
    { value: 'settled', label: t('settlements.tabs.settled') },
  ];

  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await refetch();
    } finally {
      setIsRefreshing(false);
    }
  }, [refetch]);

  const openDetail = useCallback(
    (settlement: Settlement) => {
      track('settlement_viewed', { status: settlement.status });
      navigation.navigate('SettlementDetail', { id: settlement.id });
    },
    [navigation],
  );

  const showSkeleton = isLoading && settlements.length === 0;
  const showError = isError && settlements.length === 0;
  const showEmpty = !isLoading && !isError && settlements.length === 0;

  const renderRow = useCallback(
    ({ item }: { item: Settlement }) => (
      <SettlementRow
        settlement={item}
        onPress={openDetail}
        onInstantSettle={setInstantTarget}
        isOnline={isOnline}
      />
    ),
    [openDetail, isOnline],
  );

  return (
    <Screen padded={false} testID="settlements-list-screen">
      <View style={styles.header}>
        <Text style={styles.title}>{t('settlements.title')}</Text>
      </View>

      <FilterChips options={tabs} value={tab} onChange={setTab} testID="settlements-tab" />

      {showSkeleton ? (
        <ListSkeleton count={4} />
      ) : showError ? (
        <ErrorState error={error} title={t('settlements.errorTitle')} onRetry={() => void refetch()} />
      ) : showEmpty ? (
        <EmptyState
          icon={tab === 'pending' ? 'checkmark-done-outline' : 'wallet-outline'}
          title={t(tab === 'pending' ? 'settlements.emptyPendingTitle' : 'settlements.emptySettledTitle')}
          body={t(tab === 'pending' ? 'settlements.emptyPendingBody' : 'settlements.emptySettledBody')}
        />
      ) : (
        <FlatList
          data={settlements}
          keyExtractor={(item) => item.id}
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
          ListHeaderComponent={
            tab === 'pending' ? (
              <View style={styles.t1Note}>
                <Ionicons name="information-circle-outline" size={15} color={colors.info} />
                <Text style={styles.t1NoteText}>{t('settlements.t1Note')}</Text>
              </View>
            ) : null
          }
          initialNumToRender={8}
          maxToRenderPerBatch={8}
          windowSize={5}
          removeClippedSubviews
        />
      )}

      {!isOnline && settlements.length > 0 ? (
        <View style={styles.offlineFooter}>
          <Ionicons name="cloud-offline-outline" size={14} color={colors.textTertiary} />
          <Text style={styles.offlineFooterText}>{t('network.offlineBanner')}</Text>
        </View>
      ) : null}

      <InstantSettleSheet
        settlement={instantTarget}
        onClose={() => setInstantTarget(null)}
        onSettled={() => {
          setInstantTarget(null);
          // The batch has moved from pending to settled; both tabs are now stale.
          void refetch();
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: spacing.md, paddingTop: spacing.xs },
  title: { ...typography.heading, color: colors.text },
  listContent: { padding: spacing.md, paddingTop: spacing.xs, gap: spacing.sm },
  t1Note: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.infoLight,
    marginBottom: spacing.xs,
  },
  t1NoteText: { ...typography.caption, color: colors.info, flex: 1 },
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
