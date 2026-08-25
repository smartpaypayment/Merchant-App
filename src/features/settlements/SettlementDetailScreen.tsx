import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute, type NavigationProp, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, radius, spacing, typography, MIN_TOUCH_TARGET } from '@theme/index';
import {
  AmountDisplay,
  EmptyState,
  ErrorState,
  SecondaryButton,
  Screen,
  SettlementStatusBadge,
  Skeleton,
  SummaryCard,
  TransactionRow,
} from '@components/index';
import { useAuthStore } from '@store/authStore';
import { formatPaise } from '@utils/money';
import { dateParts, formatTime } from '@utils/date';
import { track } from '@utils/analytics';
import type { Transaction } from '@models/index';
import type { SettlementDetail } from '@api/settlements.api';
import type { RootStackParamList, SettlementsStackParamList } from '@app/navigation/types';
import { ScreenHeader } from '@features/collect/ScreenHeader';
import { useSettlement } from './useSettlements';
import { buildStatementCsv, shareStatement, statementFileName } from './statementExport';

type Nav = NativeStackNavigationProp<SettlementsStackParamList, 'SettlementDetail'>;
type Route = RouteProp<SettlementsStackParamList, 'SettlementDetail'>;

/**
 * Section 6.12 Settlement Detail Screen.
 *
 * Batch breakdown (gross, fees, net), bank account, UTR, timestamps, and the list
 * of transactions in the batch — which is the transaction-to-settlement
 * reconciliation view PRD SET-4 asks for.
 */
export function SettlementDetailScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Route>();

  const { data, isLoading, isError, error, refetch } = useSettlement(params.id);

  return (
    <Screen scroll testID="settlement-detail-screen">
      <ScreenHeader title={t('settlements.detail.title')} onBack={() => navigation.goBack()} />

      {isLoading ? (
        <View style={styles.skeletonBlock}>
          <Skeleton width="55%" height={38} />
          <Skeleton width="35%" height={18} style={styles.skeletonGap} />
          <Skeleton width="100%" height={90} style={styles.skeletonCard} />
          <Skeleton width="100%" height={140} style={styles.skeletonCard} />
        </View>
      ) : isError || !data ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : (
        <DetailBody settlement={data} />
      )}
    </Screen>
  );
}

function DetailBody({ settlement }: { settlement: SettlementDetail }) {
  const { t } = useTranslation();
  // Typed against the root list: the transaction cross-link jumps into the
  // Transactions tab, which is outside this stack's own param list.
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const merchant = useAuthStore((s) => s.merchant);

  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const isSettled = settlement.status === 'settled';
  const created = dateParts(settlement.createdAt);

  /** Section 6.11 / SET-3: downloadable statement. */
  const downloadStatement = useCallback(async () => {
    setExporting(true);
    setExportError(null);

    try {
      const csv = buildStatementCsv(settlement, settlement.transactions, {
        date: t('settlements.statement.colDate'),
        time: t('settlements.statement.colTime'),
        txnId: t('settlements.statement.colTxnId'),
        utr: t('settlements.statement.colUtr'),
        mode: t('settlements.statement.colMode'),
        status: t('settlements.statement.colStatus'),
        gross: t('settlements.statement.colGross'),
        fee: t('settlements.statement.colFee'),
        net: t('settlements.statement.colNet'),
        total: t('settlements.statement.totalsLabel'),
        modeLabels: {
          upi_qr: t('transactions.mode.upi_qr'),
          upi_intent: t('transactions.mode.upi_intent'),
          payment_link: t('transactions.mode.payment_link'),
          card: t('transactions.mode.card'),
          netbanking: t('transactions.mode.netbanking'),
          wallet: t('transactions.mode.wallet'),
        },
        statusLabels: {
          success: t('transactions.status.success'),
          pending: t('transactions.status.pending'),
          failed: t('transactions.status.failed'),
          refunded: t('transactions.status.refunded'),
          partially_refunded: t('transactions.status.partially_refunded'),
        },
      });

      const result = await shareStatement(
        statementFileName(settlement),
        csv,
        t('settlements.statement.fileName'),
      );

      if (!result.ok) {
        setExportError(t('settlements.statement.failed'));
        return;
      }
      track('report_exported', { kind: 'settlement_statement', format: 'csv' });
    } finally {
      setExporting(false);
    }
  }, [settlement, t]);

  const openTransaction = useCallback(
    (txn: Transaction) => {
      // Cross-tab jump: reconciliation often ends in "what was this one payment?".
      navigation.navigate('Main', {
        screen: 'Transactions',
        params: { screen: 'TransactionDetail', params: { id: txn.id } },
      });
    },
    [navigation],
  );

  return (
    <>
      {/* -------------------------------- Hero -------------------------------- */}
      <View style={styles.hero}>
        <Text style={styles.heroCaption}>
          {isSettled ? t('settlements.creditedLabel') : t('settlements.expectedLabel')}
        </Text>
        <AmountDisplay
          amount={settlement.netAmount}
          size="hero"
          tone={isSettled ? 'success' : 'default'}
          testID="settlement-detail-net"
        />
        <View style={styles.badgeRow}>
          <SettlementStatusBadge status={settlement.status} />
        </View>
      </View>

      {/* ----------------------------- Breakdown ----------------------------- */}
      <Text style={styles.sectionTitle}>{t('settlements.detail.breakdownTitle')}</Text>
      <View style={styles.summaryRow}>
        <SummaryCard
          label={t('settlements.detail.grossLabel')}
          amount={settlement.grossAmount}
          icon="arrow-down-circle-outline"
        />
        <SummaryCard
          label={t('settlements.detail.feeLabel')}
          amount={settlement.feeAmount}
          icon="pricetag-outline"
        />
      </View>
      <View style={styles.netCard}>
        <Text style={styles.netLabel}>{t('settlements.detail.netLabel')}</Text>
        <AmountDisplay amount={settlement.netAmount} size="lg" tone="success" />
      </View>

      {/* --------------------------- Bank + refs ----------------------------- */}
      <Text style={styles.sectionTitle}>{t('settlements.detail.bankTitle')}</Text>
      <View style={styles.card}>
        <InfoRow
          label={t('settlements.detail.accountLabel')}
          value={settlement.bankAccountMasked}
          mono
        />
        {merchant?.bankAccount.ifsc ? (
          <InfoRow label={t('settlements.detail.ifscLabel')} value={merchant.bankAccount.ifsc} mono bordered />
        ) : null}
        {settlement.utr ? (
          <InfoRow label={t('settlements.detail.utrLabel')} value={settlement.utr} mono bordered />
        ) : null}
        <InfoRow
          label={t('settlements.detail.createdLabel')}
          value={`${created.day} ${t(created.monthKey)} ${created.year}, ${formatTime(settlement.createdAt)}`}
          bordered
        />
        {settlement.settledAt ? (
          <InfoRow
            label={t('settlements.detail.settledLabel')}
            value={(() => {
              const s = dateParts(settlement.settledAt);
              return `${s.day} ${t(s.monthKey)} ${s.year}, ${formatTime(settlement.settledAt)}`;
            })()}
            bordered
          />
        ) : null}
      </View>

      {/* --------------------------- Statement ------------------------------- */}
      <SecondaryButton
        label={exporting ? t('settlements.statement.preparing') : t('settlements.statement.download')}
        onPress={() => void downloadStatement()}
        loading={exporting}
        disabled={settlement.transactions.length === 0}
        iconLeft="download-outline"
        fullWidth
        style={styles.statementCta}
        testID="settlement-download-statement"
      />
      <Text style={styles.formatNote}>{t('settlements.statement.formatNote')}</Text>
      {exportError ? (
        <View style={styles.errorRow}>
          <Ionicons name="alert-circle" size={16} color={colors.error} />
          <Text style={styles.errorText}>{exportError}</Text>
        </View>
      ) : null}

      {/* ------------------------ Included payments -------------------------- */}
      <Text style={styles.sectionTitle}>{t('settlements.detail.txnTitle')}</Text>

      {settlement.transactions.length === 0 ? (
        <EmptyState
          icon="receipt-outline"
          title={t('settlements.detail.noTxnTitle')}
          body={t('settlements.detail.noTxnBody')}
          compact
        />
      ) : (
        <>
          <Text style={styles.reconcileNote}>{t('settlements.detail.reconcileNote')}</Text>
          <View style={styles.txnCard}>
            {settlement.transactions.map((txn, index) => (
              <View key={txn.id}>
                {index > 0 ? <View style={styles.txnDivider} /> : null}
                <TransactionRow transaction={txn} onPress={openTransaction} hideSuccessBadge />
              </View>
            ))}
          </View>
          <Text style={styles.txnCount}>
            {t('settlements.detail.txnCount', { count: settlement.transactions.length })} ·{' '}
            {formatPaise(settlement.grossAmount)}
          </Text>
        </>
      )}
    </>
  );
}

function InfoRow({
  label,
  value,
  mono = false,
  bordered = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
  bordered?: boolean;
}) {
  return (
    <View style={[styles.infoRow, bordered && styles.infoRowBordered]}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoValue, mono && styles.infoValueMono]} numberOfLines={2} selectable>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  skeletonBlock: { paddingTop: spacing.lg, gap: spacing.xs },
  skeletonGap: { marginTop: spacing.xs },
  skeletonCard: { marginTop: spacing.lg, borderRadius: radius.lg },
  hero: { alignItems: 'center', paddingVertical: spacing.lg },
  heroCaption: { ...typography.caption, color: colors.textTertiary, marginBottom: spacing.xxs },
  badgeRow: { marginTop: spacing.xs },
  sectionTitle: {
    ...typography.captionMedium,
    color: colors.textSecondary,
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
  },
  summaryRow: { flexDirection: 'row', gap: spacing.sm },
  netCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginTop: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.successLight,
  },
  netLabel: { ...typography.smallMedium, color: colors.success, flex: 1 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: MIN_TOUCH_TARGET,
  },
  infoRowBordered: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  infoLabel: { ...typography.small, color: colors.textSecondary, flexShrink: 0 },
  infoValue: { ...typography.smallMedium, color: colors.text, flex: 1, textAlign: 'right' },
  infoValueMono: { fontVariant: ['tabular-nums'], fontSize: 13 },
  statementCta: { marginTop: spacing.lg },
  formatNote: {
    ...typography.caption,
    color: colors.textTertiary,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.xs },
  errorText: { ...typography.caption, color: colors.error, flex: 1 },
  reconcileNote: { ...typography.caption, color: colors.textTertiary, marginBottom: spacing.xs },
  txnCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  txnDivider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: 68 },
  txnCount: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'right',
    marginTop: spacing.xs,
  },
});
