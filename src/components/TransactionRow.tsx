import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import { colors, radius, spacing, typography, MIN_TOUCH_TARGET } from '@theme/index';
import type { PaymentMode, Transaction } from '@models/index';
import { formatTime } from '@utils/date';
import { AmountDisplay } from './AmountDisplay';
import { TransactionStatusBadge } from './StatusBadge';

/** Section 6.8: "mode icon (UPI/card/link)". */
const MODE_ICON: Record<PaymentMode, keyof typeof Ionicons.glyphMap> = {
  upi_qr: 'qr-code-outline',
  upi_intent: 'phone-portrait-outline',
  payment_link: 'link-outline',
  card: 'card-outline',
  netbanking: 'business-outline',
  wallet: 'wallet-outline',
};

export interface TransactionRowProps {
  transaction: Transaction;
  onPress?: (transaction: Transaction) => void;
  /** Hides the status pill for successful rows to reduce noise on the dashboard. */
  hideSuccessBadge?: boolean;
}

/**
 * Section 7 `TransactionRow`: amount, mode icon, status badge, time, payer ref.
 *
 * Memoized because the transactions list is virtualized and re-renders on every
 * filter/pagination change; the row is otherwise the hot path on low-end devices.
 */
export const TransactionRow = memo(function TransactionRow({
  transaction,
  onPress,
  hideSuccessBadge = false,
}: TransactionRowProps) {
  const { t } = useTranslation();
  const { amount, status, mode, payerVpaMasked, createdAt } = transaction;

  const isCredit = status === 'success' || status === 'pending';
  const showBadge = !(hideSuccessBadge && status === 'success');

  return (
    <Pressable
      onPress={onPress ? () => onPress(transaction) : undefined}
      disabled={!onPress}
      android_ripple={{ color: 'rgba(0,0,0,0.06)' }}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`${t('a11y.amount', { amount: amount / 100 })}, ${t(`transactions.status.${status}`, { defaultValue: status })}`}
      style={({ pressed }) => [styles.row, pressed && onPress ? styles.pressed : null]}
    >
      <View style={[styles.iconCircle, isCredit ? styles.iconCredit : styles.iconNeutral]}>
        <Ionicons
          name={MODE_ICON[mode]}
          size={20}
          color={isCredit ? colors.success : colors.textSecondary}
        />
      </View>

      <View style={styles.body}>
        <Text style={styles.payer} numberOfLines={1}>
          {payerVpaMasked ?? t(`transactions.mode.${mode}`, { defaultValue: mode })}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {formatTime(createdAt)}
        </Text>
      </View>

      <View style={styles.trailing}>
        <AmountDisplay
          amount={amount}
          size="md"
          tone={status === 'failed' ? 'muted' : 'default'}
          hideDecimals={amount % 100 === 0}
        />
        {showBadge ? <TransactionStatusBadge status={status} size="sm" /> : null}
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: MIN_TOUCH_TARGET + 12,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
    backgroundColor: colors.surface,
  },
  pressed: { backgroundColor: colors.surfaceAlt },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCredit: { backgroundColor: colors.successLight },
  iconNeutral: { backgroundColor: colors.surfaceAlt },
  body: { flex: 1 },
  payer: { ...typography.bodyMedium, color: colors.text },
  meta: { ...typography.caption, color: colors.textTertiary, marginTop: 2 },
  trailing: { alignItems: 'flex-end', gap: spacing.xxs },
});
