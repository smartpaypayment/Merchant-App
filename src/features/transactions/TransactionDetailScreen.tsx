import { Alert, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, radius, spacing, typography, MIN_TOUCH_TARGET } from '@theme/index';
import {
  AmountDisplay,
  ErrorState,
  Screen,
  Skeleton,
  TransactionStatusBadge,
} from '@components/index';
import { transactionsApi } from '@api/index';
import { queryKeys } from '@app/providers/queryClient';
import { useNetworkStatus } from '@hooks/useNetworkStatus';
import { formatPaise } from '@utils/money';
import { dateParts, formatTime } from '@utils/date';
import type { Transaction } from '@models/index';
import type { TransactionsStackParamList } from '@app/navigation/types';
import { ScreenHeader } from '@features/collect/ScreenHeader';
import { getRefundEligibility } from './refundEligibility';

type Nav = NativeStackNavigationProp<TransactionsStackParamList, 'TransactionDetail'>;
type Route = RouteProp<TransactionsStackParamList, 'TransactionDetail'>;

/**
 * Section 6.9 Transaction Detail Screen.
 *
 * Full details plus the four actions: Refund (if eligible), Share receipt, Raise
 * dispute, Report issue.
 *
 * The fee/MDR breakdown is shown even when the fee is zero. UPI P2M is currently
 * zero-MDR, and stating that explicitly is more reassuring to a merchant than
 * omitting the line and leaving them to wonder what was deducted (§4.4 SET-5,
 * "MDR/fee transparency per transaction").
 */
export function TransactionDetailScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Route>();
  const { isOnline } = useNetworkStatus();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: queryKeys.transaction(params.id),
    queryFn: () => transactionsApi.getTransaction(params.id),
  });

  const shareReceipt = async (txn: Transaction) => {
    try {
      await Share.share({
        message: t('transactions.detail.receiptMessage', {
          amount: formatPaise(txn.amount),
          time: formatTime(txn.createdAt),
          id: txn.id,
        }),
      });
    } catch {
      /* Sheet dismissed. */
    }
  };

  /**
   * Dispute and issue reporting route into the support ticket flow, which is
   * built in step 9. Rather than render a dead button, we acknowledge the tap and
   * say where it will go — an unresponsive control on a money screen reads as a
   * bug and erodes trust.
   */
  const notImplemented = () => {
    Alert.alert(t('common.comingSoon'), t('common.comingSoonBody'));
  };

  return (
    <Screen scroll testID="transaction-detail-screen">
      <ScreenHeader title={t('transactions.detail.title')} onBack={() => navigation.goBack()} />

      {isLoading ? (
        <View style={styles.skeletonBlock}>
          <Skeleton width="50%" height={40} />
          <Skeleton width="30%" height={18} style={styles.skeletonGap} />
          <Skeleton width="100%" height={140} style={styles.skeletonCard} />
          <Skeleton width="100%" height={120} style={styles.skeletonCard} />
        </View>
      ) : isError || !data ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : (
        <DetailBody
          transaction={data}
          isOnline={isOnline}
          onRefund={() => navigation.navigate('Refund', { id: data.id })}
          onShare={() => void shareReceipt(data)}
          onDispute={notImplemented}
          onReport={notImplemented}
        />
      )}
    </Screen>
  );
}

function DetailBody({
  transaction,
  isOnline,
  onRefund,
  onShare,
  onDispute,
  onReport,
}: {
  transaction: Transaction;
  isOnline: boolean;
  onRefund: () => void;
  onShare: () => void;
  onDispute: () => void;
  onReport: () => void;
}) {
  const { t } = useTranslation();
  const eligibility = getRefundEligibility(transaction);

  const { day, monthKey, year } = dateParts(transaction.createdAt);
  const timestamp = `${day} ${t(monthKey)} ${year}, ${formatTime(transaction.createdAt)}`;

  const isCredit = transaction.status === 'success' || transaction.status === 'partially_refunded';

  const rows: { label: string; value: string; mono?: boolean }[] = [
    { label: t('transactions.detail.modeLabel'), value: t(`transactions.mode.${transaction.mode}`) },
    { label: t('transactions.detail.timeLabel'), value: timestamp },
    ...(transaction.payerVpaMasked
      ? [{ label: t('transactions.detail.payerLabel'), value: transaction.payerVpaMasked }]
      : []),
    { label: t('transactions.detail.txnIdLabel'), value: transaction.id, mono: true },
    ...(transaction.utr
      ? [{ label: t('transactions.detail.utrLabel'), value: transaction.utr, mono: true }]
      : []),
    ...(transaction.note
      ? [{ label: t('transactions.detail.noteLabel'), value: transaction.note }]
      : []),
  ];

  return (
    <>
      {/* ------------------------------- Hero -------------------------------- */}
      <View style={styles.hero}>
        <AmountDisplay
          amount={transaction.amount}
          size="hero"
          tone={transaction.status === 'failed' ? 'muted' : isCredit ? 'success' : 'default'}
          testID="detail-amount"
        />
        <View style={styles.badgeRow}>
          <TransactionStatusBadge status={transaction.status} />
        </View>
      </View>

      {/* ------------------------------ Details ----------------------------- */}
      <View style={styles.card}>
        {rows.map((row, index) => (
          <View key={row.label} style={[styles.row, index > 0 && styles.rowBordered]}>
            <Text style={styles.rowLabel}>{row.label}</Text>
            <Text
              style={[styles.rowValue, row.mono && styles.rowValueMono]}
              numberOfLines={2}
              selectable
            >
              {row.value}
            </Text>
          </View>
        ))}
      </View>

      {/* ---------------------------- Breakdown ----------------------------- */}
      <Text style={styles.sectionTitle}>{t('transactions.detail.breakdownTitle')}</Text>
      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>{t('transactions.detail.grossLabel')}</Text>
          <AmountDisplay amount={transaction.amount} size="sm" />
        </View>

        <View style={[styles.row, styles.rowBordered]}>
          <Text style={styles.rowLabel}>{t('transactions.detail.feeLabel')}</Text>
          {transaction.fee > 0 ? (
            <AmountDisplay amount={-transaction.fee} size="sm" tone="error" />
          ) : (
            <Text style={styles.noFee}>{t('transactions.detail.noFee')}</Text>
          )}
        </View>

        <View style={[styles.row, styles.rowBordered]}>
          <Text style={styles.rowLabelStrong}>{t('transactions.detail.netLabel')}</Text>
          <AmountDisplay amount={transaction.netAmount} size="md" tone="success" />
        </View>

        {eligibility.alreadyRefunded > 0 ? (
          <View style={[styles.row, styles.rowBordered]}>
            <Text style={styles.rowLabel}>{t('transactions.detail.refundedLabel')}</Text>
            <AmountDisplay amount={-eligibility.alreadyRefunded} size="sm" tone="error" />
          </View>
        ) : null}
      </View>

      {/* --------------------------- Settlement ----------------------------- */}
      {isCredit ? (
        <>
          <Text style={styles.sectionTitle}>{t('transactions.detail.settlementTitle')}</Text>
          <View style={styles.card}>
            <View style={styles.settlementRow}>
              <Ionicons
                name={transaction.settlementId ? 'checkmark-circle' : 'time-outline'}
                size={20}
                color={transaction.settlementId ? colors.success : colors.warning}
              />
              <Text style={styles.settlementText}>
                {transaction.settlementId
                  ? t('transactions.detail.settlementDone')
                  : t('transactions.detail.settlementPending')}
              </Text>
            </View>
          </View>
        </>
      ) : null}

      {/* ----------------------------- Actions ------------------------------ */}
      <Text style={styles.sectionTitle}>{t('transactions.detail.actions')}</Text>
      <View style={styles.card}>
        {eligibility.eligible ? (
          <ActionRow
            icon="return-down-back-outline"
            label={t('transactions.detail.refund')}
            onPress={onRefund}
            // Section 11: disable actions that require connectivity.
            disabled={!isOnline}
            disabledHint={t('network.offlineActionDisabled')}
            testID="detail-refund-action"
          />
        ) : (
          <View style={styles.notRefundable}>
            <Ionicons name="information-circle-outline" size={16} color={colors.textTertiary} />
            <Text style={styles.notRefundableText}>{t('transactions.detail.notRefundable')}</Text>
          </View>
        )}

        <ActionRow
          icon="share-social-outline"
          label={t('transactions.detail.shareReceipt')}
          onPress={onShare}
          bordered
          testID="detail-share-action"
        />
        <ActionRow
          icon="alert-circle-outline"
          label={t('transactions.detail.raiseDispute')}
          onPress={onDispute}
          bordered
        />
        <ActionRow
          icon="help-buoy-outline"
          label={t('transactions.detail.reportIssue')}
          onPress={onReport}
          bordered
        />
      </View>
    </>
  );
}

function ActionRow({
  icon,
  label,
  onPress,
  bordered = false,
  disabled = false,
  disabledHint,
  testID,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  bordered?: boolean;
  disabled?: boolean;
  disabledHint?: string;
  testID?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      accessibilityLabel={label}
      {...(disabled && disabledHint ? { accessibilityHint: disabledHint } : {})}
      android_ripple={{ color: 'rgba(0,0,0,0.06)' }}
      style={({ pressed }) => [
        styles.actionRow,
        bordered && styles.rowBordered,
        pressed && !disabled && styles.actionRowPressed,
      ]}
      testID={testID}
    >
      <Ionicons name={icon} size={20} color={disabled ? colors.disabled : colors.primary} />
      <View style={styles.actionBody}>
        <Text style={[styles.actionLabel, disabled && styles.actionLabelDisabled]}>{label}</Text>
        {disabled && disabledHint ? <Text style={styles.actionHint}>{disabledHint}</Text> : null}
      </View>
      <Ionicons
        name="chevron-forward"
        size={18}
        color={disabled ? colors.disabled : colors.textTertiary}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  skeletonBlock: { paddingTop: spacing.lg, gap: spacing.xs },
  skeletonGap: { marginTop: spacing.xs },
  skeletonCard: { marginTop: spacing.lg, borderRadius: radius.lg },
  hero: { alignItems: 'center', paddingVertical: spacing.lg },
  badgeRow: { marginTop: spacing.xs },
  sectionTitle: {
    ...typography.captionMedium,
    color: colors.textSecondary,
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: MIN_TOUCH_TARGET,
  },
  rowBordered: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  rowLabel: { ...typography.small, color: colors.textSecondary, flexShrink: 0 },
  rowLabelStrong: { ...typography.smallMedium, color: colors.text },
  rowValue: { ...typography.smallMedium, color: colors.text, flex: 1, textAlign: 'right' },
  rowValueMono: { fontVariant: ['tabular-nums'], fontSize: 13 },
  noFee: { ...typography.smallMedium, color: colors.success },
  settlementRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.sm },
  settlementText: { ...typography.small, color: colors.textSecondary, flex: 1 },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: MIN_TOUCH_TARGET + 4,
    paddingVertical: spacing.sm,
  },
  actionRowPressed: { opacity: 0.7 },
  actionBody: { flex: 1 },
  actionLabel: { ...typography.body, color: colors.text },
  actionLabelDisabled: { color: colors.disabled },
  actionHint: { ...typography.caption, color: colors.textTertiary },
  notRefundable: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
  },
  notRefundableText: { ...typography.caption, color: colors.textTertiary, flex: 1 },
});
