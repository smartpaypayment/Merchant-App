import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, radius, spacing, typography, MIN_TOUCH_TARGET } from '@theme/index';
import { AmountDisplay, SettlementStatusBadge } from '@components/index';
import type { Settlement } from '@models/index';
import { dateParts, relativeDayKey } from '@utils/date';

export interface SettlementRowProps {
  settlement: Settlement;
  onPress: (settlement: Settlement) => void;
  onInstantSettle: (settlement: Settlement) => void;
  /** Instant settle needs connectivity (Section 11). */
  isOnline: boolean;
}

/**
 * One settlement batch in the Section 6.11 list.
 *
 * ## Why the card is a plain View
 *
 * The card holds **two** independent actions — open the batch, and settle it now.
 * They are rendered as sibling `Pressable`s inside a non-interactive `View`,
 * never nested.
 *
 * Nesting them (the original shape) was wrong on three counts:
 *   1. React Native Web maps `accessibilityRole="button"` to a real `<button>`
 *      element, so a nested pressable produces `<button>` inside `<button>` —
 *      invalid DOM, which React reports as an error.
 *   2. A screen reader encountering an interactive control inside another
 *      interactive control cannot describe either unambiguously.
 *   3. The touch target of the inner control overlaps the outer one, so which
 *      handler wins is an implementation detail rather than a stated intent.
 *
 * Keeping them siblings makes both targets explicit. `SettlementRow.test.tsx`
 * asserts that pressing "Settle now" does not also trigger the row press.
 */
function SettlementRowBase({ settlement, onPress, onInstantSettle, isOnline }: SettlementRowProps) {
  const { t } = useTranslation();

  const isSettled = settlement.status === 'settled';
  const timestamp = settlement.settledAt ?? settlement.createdAt;
  const relative = relativeDayKey(timestamp);
  const { day, monthKey, year } = dateParts(timestamp);
  const dateLabel = relative ? t(relative) : `${day} ${t(monthKey)} ${year}`;

  // Instant settle only makes sense on money that has not landed yet.
  const canSettleNow = !isSettled && settlement.status !== 'failed';

  return (
    <View style={styles.card}>
      <Pressable
        onPress={() => onPress(settlement)}
        accessibilityRole="button"
        accessibilityLabel={`${dateLabel}, ${t(`settlements.status.${settlement.status}`)}`}
        android_ripple={{ color: 'rgba(0,0,0,0.06)' }}
        style={({ pressed }) => [styles.cardMain, pressed && styles.cardMainPressed]}
        testID={`settlement-row-${settlement.id}`}
      >
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderText}>
            <Text style={styles.dateLabel}>{dateLabel}</Text>
            <Text style={styles.batchLabel}>
              {t('settlements.batchLabel', { count: settlement.transactionCount })}
            </Text>
          </View>
          <SettlementStatusBadge status={settlement.status} />
        </View>

        <View style={styles.amountRow}>
          <View style={styles.amountBlock}>
            <Text style={styles.amountCaption}>
              {isSettled ? t('settlements.creditedLabel') : t('settlements.expectedLabel')}
            </Text>
            <AmountDisplay
              amount={settlement.netAmount}
              size="lg"
              tone={isSettled ? 'success' : 'default'}
              testID={`settlement-amount-${settlement.id}`}
            />
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
        </View>

        {/* UTR is the merchant's reconciliation handle against their bank line. */}
        {settlement.utr ? (
          <View style={styles.utrRow}>
            <Ionicons name="receipt-outline" size={13} color={colors.textTertiary} />
            <Text style={styles.utrText} numberOfLines={1} selectable>
              {t('settlements.utrLabel')}: {settlement.utr}
            </Text>
          </View>
        ) : null}
      </Pressable>

      {canSettleNow ? (
        <Pressable
          onPress={() => onInstantSettle(settlement)}
          disabled={!isOnline}
          accessibilityRole="button"
          accessibilityLabel={t('settlements.instant.cta')}
          {...(!isOnline ? { accessibilityHint: t('settlements.instant.offlineBody') } : {})}
          style={({ pressed }) => [
            styles.instantButton,
            pressed && isOnline && styles.instantButtonPressed,
            !isOnline && styles.instantButtonDisabled,
          ]}
          testID={`settlement-instant-${settlement.id}`}
        >
          <Ionicons name="flash" size={16} color={isOnline ? colors.primary : colors.disabled} />
          <Text style={[styles.instantLabel, !isOnline && styles.instantLabelDisabled]}>
            {t('settlements.instant.cta')}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  // Padding lives on the pressable area, not the card, so the whole visual
  // region is tappable rather than leaving an inert border.
  cardMain: { padding: spacing.md },
  cardMainPressed: { backgroundColor: colors.surfaceAlt },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs },
  cardHeaderText: { flex: 1 },
  dateLabel: { ...typography.bodyMedium, color: colors.text },
  batchLabel: { ...typography.caption, color: colors.textTertiary, marginTop: 2 },
  amountRow: { flexDirection: 'row', alignItems: 'flex-end', marginTop: spacing.sm, gap: spacing.xs },
  amountBlock: { flex: 1 },
  amountCaption: { ...typography.caption, color: colors.textSecondary },
  utrRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    marginTop: spacing.xs,
    paddingTop: spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  utrText: { ...typography.caption, color: colors.textTertiary, flex: 1, fontVariant: ['tabular-nums'] },
  instantButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xxs,
    minHeight: MIN_TOUCH_TARGET,
    // Separated from the tappable summary by a divider, so the two targets read
    // as distinct rather than as one block.
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.primaryLight,
  },
  instantButtonPressed: { opacity: 0.75 },
  instantButtonDisabled: { backgroundColor: colors.surfaceAlt },
  instantLabel: { ...typography.smallMedium, color: colors.primary },
  instantLabelDisabled: { color: colors.disabled },
});

export const SettlementRow = memo(SettlementRowBase);
