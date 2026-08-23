import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, radius, shadow, spacing, typography } from '@theme/index';
import {
  AmountDisplay,
  EmptyState,
  ErrorState,
  KycStatusBadge,
  PrimaryButton,
  Screen,
  SummaryCardSkeleton,
  TransactionRow,
  ListSkeleton,
} from '@components/index';
import { useAuthStore } from '@store/authStore';
import { useNetworkStatus } from '@hooks/useNetworkStatus';
import type { Transaction } from '@models/index';
import { useDashboard } from './useDashboard';
import { QuickActionsRow } from './QuickActionsRow';

/**
 * Section 6.5 Home Screen (Dashboard).
 *
 * Layout follows the spec order: header (name, KYC badge, bell) → today's summary
 * → big Collect CTA → quick actions → recent transactions.
 *
 * All four required states are handled explicitly:
 *   - loading  → skeleton cards (not a spinner, so the layout does not jump)
 *   - loaded   → data
 *   - empty    → onboarding nudge ("show your QR to get your first payment")
 *   - error    → `ErrorState` with retry
 *   - offline  → cached figures plus the offline banner from `Screen`
 *
 * The offline case is deliberately *not* an error: React Query's persisted cache
 * still holds yesterday's summary, and a merchant with no signal is better served
 * by stale numbers plus a banner than by a blocking error page (Section 11).
 */
export function HomeScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const merchant = useAuthStore((s) => s.merchant);
  const { isOnline } = useNetworkStatus();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { data, isLoading, isError, error, refetch } = useDashboard();

  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await refetch();
    } finally {
      setIsRefreshing(false);
    }
  }, [refetch]);

  const openTransaction = useCallback(
    (transaction: Transaction) => {
      navigation.navigate('Main', {
        screen: 'Transactions',
        params: { screen: 'TransactionDetail', params: { id: transaction.id } },
      });
    },
    [navigation],
  );

  const goToCollect = useCallback(() => {
    navigation.navigate('Main', { screen: 'Collect', params: { screen: 'CollectPayment' } });
  }, [navigation]);

  const goToAllTransactions = useCallback(() => {
    navigation.navigate('Main', {
      screen: 'Transactions',
      params: { screen: 'TransactionsList' },
    });
  }, [navigation]);

  const recent = data?.recentTransactions ?? [];
  // Only a hard failure with nothing cached should replace the whole screen.
  const showErrorState = isError && !data;
  const showEmptyState = !!data && recent.length === 0;

  return (
    <Screen
      scroll
      padded={false}
      testID="home-screen"
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={() => void onRefresh()}
          colors={[colors.primary]}
          tintColor={colors.primary}
        />
      }
    >
      {/* ------------------------------ Header ------------------------------ */}
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.greeting}>{t('home.greeting')}</Text>
          <Text style={styles.businessName} numberOfLines={1}>
            {merchant?.businessName || t('common.appName')}
          </Text>
        </View>

        {merchant ? <KycStatusBadge status={merchant.kycStatus} /> : null}

        <Pressable
          onPress={() => navigation.navigate('Notifications')}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={t('a11y.notifications')}
          style={styles.bell}
        >
          <Ionicons name="notifications-outline" size={24} color={colors.text} />
        </Pressable>
      </View>

      {showErrorState ? (
        <ErrorState
          error={error}
          title={t('home.error.title')}
          onRetry={() => void refetch()}
        />
      ) : (
        <>
          {/* ------------------------- Today's summary ------------------------ */}
          <View style={styles.section}>
            {isLoading && !data ? (
              <SummaryCardSkeleton />
            ) : (
              <View style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>{t('home.summary.collected')}</Text>
                <AmountDisplay
                  amount={data?.todayCollected ?? 0}
                  size="hero"
                  tone="inverse"
                  testID="home-today-collected"
                />
                <Text style={styles.summaryCount}>
                  {t('home.summary.txnCount', { count: data?.todayTxnCount ?? 0 })}
                </Text>

                <View style={styles.summaryDivider} />

                <View style={styles.pendingRow}>
                  <View style={styles.pendingText}>
                    <Text style={styles.pendingLabel}>{t('home.summary.pendingSettlement')}</Text>
                    <Text style={styles.pendingHint}>{t('home.summary.settlementHint')}</Text>
                  </View>
                  <AmountDisplay
                    amount={data?.pendingSettlement ?? 0}
                    size="md"
                    tone="inverse"
                    hideDecimals
                  />
                </View>
              </View>
            )}
          </View>

          {/* --------------------------- Collect CTA -------------------------- */}
          <View style={styles.section}>
            <PrimaryButton
              label={t('home.collectCta')}
              onPress={goToCollect}
              iconLeft="qr-code"
              size="lg"
              fullWidth
              testID="home-collect-cta"
            />
          </View>

          {/* -------------------------- KYC nudge ---------------------------- */}
          {merchant && merchant.kycStatus !== 'approved' ? (
            <Pressable
              onPress={goToCollect}
              style={styles.nudge}
              accessibilityRole="button"
              accessibilityLabel={t('home.kycNudge.title')}
            >
              <Ionicons name="alert-circle-outline" size={20} color={colors.warning} />
              <View style={styles.nudgeText}>
                <Text style={styles.nudgeTitle}>{t('home.kycNudge.title')}</Text>
                <Text style={styles.nudgeBody}>{t('home.kycNudge.body')}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.warning} />
            </Pressable>
          ) : null}

          {/* -------------------------- Quick actions ------------------------ */}
          <QuickActionsRow />

          {/* ----------------------- Recent transactions --------------------- */}
          <View style={styles.recentSection}>
            <View style={styles.recentHeader}>
              <Text style={styles.recentTitle}>{t('home.recent.title')}</Text>
              {recent.length > 0 ? (
                <Pressable onPress={goToAllTransactions} hitSlop={8} accessibilityRole="button">
                  <Text style={styles.viewAll}>{t('common.viewAll')}</Text>
                </Pressable>
              ) : null}
            </View>

            <View style={styles.recentCard}>
              {isLoading && !data ? (
                <ListSkeleton count={4} />
              ) : showEmptyState ? (
                <EmptyState
                  icon="qr-code-outline"
                  title={t('home.recent.emptyTitle')}
                  body={t('home.recent.emptyBody')}
                  ctaLabel={t('home.recent.emptyCta')}
                  onCtaPress={goToCollect}
                  compact
                />
              ) : (
                recent.map((transaction, index) => (
                  <View key={transaction.id}>
                    {index > 0 ? <View style={styles.rowDivider} /> : null}
                    <TransactionRow transaction={transaction} onPress={openTransaction} />
                  </View>
                ))
              )}
            </View>
          </View>

          {/*
            Signals that the figures above may be stale. Complements the offline
            banner: the banner says "you are offline", this says "and therefore
            these numbers are from cache".
          */}
          {!isOnline && data ? (
            <Text style={styles.staleNote}>{t('network.offlineBanner')}</Text>
          ) : null}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
    paddingBottom: spacing.md,
  },
  headerText: { flex: 1 },
  greeting: { ...typography.caption, color: colors.textTertiary },
  businessName: { ...typography.bodyLarge, color: colors.text },
  bell: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  section: { paddingHorizontal: spacing.md, marginBottom: spacing.md },
  summaryCard: {
    backgroundColor: colors.primary,
    borderRadius: radius.xl,
    padding: spacing.md,
    ...shadow.card,
  },
  summaryLabel: { ...typography.caption, color: 'rgba(255,255,255,0.85)' },
  summaryCount: { ...typography.small, color: 'rgba(255,255,255,0.9)', marginTop: spacing.xxs },
  summaryDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.3)',
    marginVertical: spacing.sm,
  },
  pendingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  pendingText: { flex: 1 },
  pendingLabel: { ...typography.smallMedium, color: colors.textInverse },
  pendingHint: { ...typography.caption, color: 'rgba(255,255,255,0.8)' },
  nudge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.warningLight,
  },
  nudgeText: { flex: 1 },
  nudgeTitle: { ...typography.smallMedium, color: colors.warning },
  nudgeBody: { ...typography.caption, color: colors.warning },
  recentSection: { marginTop: spacing.xs },
  recentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    marginBottom: spacing.xs,
  },
  recentTitle: { ...typography.bodyMedium, color: colors.text },
  viewAll: { ...typography.smallMedium, color: colors.primary },
  recentCard: {
    backgroundColor: colors.surface,
    marginHorizontal: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  rowDivider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: 68 },
  staleNote: {
    ...typography.caption,
    color: colors.textTertiary,
    textAlign: 'center',
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
  },
});
