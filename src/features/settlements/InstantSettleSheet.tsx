import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, radius, spacing, typography } from '@theme/index';
import { AmountDisplay, GhostButton, PrimaryButton } from '@components/index';
import { settlementsApi } from '@api/index';
import { ApiError } from '@api/errors';
import { queryKeys } from '@app/providers/queryClient';
import { useNetworkStatus } from '@hooks/useNetworkStatus';
import { formatPaise } from '@utils/money';
import { paiseProp, track } from '@utils/analytics';
import { INSTANT_SETTLEMENT_MIN_PAISE } from '@api/mocks/instantSettlement';
import type { Settlement } from '@models/index';
import { useInstantSettlementQuote } from './useSettlements';

export interface InstantSettleSheetProps {
  /** The batch to settle, or `null` to keep the sheet closed. */
  settlement: Settlement | null;
  onClose: () => void;
  onSettled: () => void;
}

/**
 * Instant settlement confirmation (Section 6.11: "Instant settle (if enabled,
 * shows fee)", PRD SET-2).
 *
 * The fee is **fetched, never computed here**, so what the merchant consents to is
 * exactly what the backend will charge. Every line of the breakdown is shown — net,
 * fee, GST on the fee, and the resulting payout — because this is the one place in
 * the app where the merchant knowingly gives up money, and a single blended
 * "charges" figure would be the wrong tradeoff for Section 4.4's fee-transparency
 * requirement.
 *
 * No PIN/biometric gate: unlike a refund, this moves the merchant's own money to
 * their own verified bank account, so the confirmed fee breakdown is the
 * appropriate level of friction.
 */
export function InstantSettleSheet({ settlement, onClose, onSettled }: InstantSettleSheetProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { isOnline } = useNetworkStatus();
  const [error, setError] = useState<ApiError | null>(null);

  const isOpen = settlement !== null;
  const quoteQuery = useInstantSettlementQuote(settlement?.id ?? null, isOpen);
  const quote = quoteQuery.data;

  const settle = useMutation({
    mutationFn: () => settlementsApi.executeInstantSettlement(settlement!.id),
    onSuccess: (result) => {
      track('settlement_viewed', { action: 'instant_settle', amount: paiseProp(result.payoutAmount) });

      // Both tabs, the batch itself, and the dashboard's pending figure move.
      void queryClient.invalidateQueries({ queryKey: ['settlements'] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });

      onSettled();
    },
    onError: (err) => setError(err instanceof ApiError ? err : null),
  });

  const close = () => {
    setError(null);
    settle.reset();
    onClose();
  };

  const feePercent = quote ? (quote.feeBps / 100).toFixed(2) : '0';

  return (
    <Modal visible={isOpen} transparent animationType="slide" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close} accessibilityLabel={t('a11y.close')} />

      <View style={styles.sheet}>
        <View style={styles.handle} />

        <View style={styles.header}>
          <View style={styles.iconCircle}>
            <Ionicons name="flash" size={22} color={colors.primary} />
          </View>
          <Text style={styles.title}>{t('settlements.instant.sheetTitle')}</Text>
          <Text style={styles.body}>{t('settlements.instant.sheetBody')}</Text>
        </View>

        {settle.isPending ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.processing}>{t('settlements.instant.processing')}</Text>
          </View>
        ) : quoteQuery.isLoading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="small" color={colors.primary} />
          </View>
        ) : quoteQuery.isError ? (
          <View style={styles.errorRow}>
            <Ionicons name="alert-circle" size={18} color={colors.error} />
            <Text style={styles.errorText}>{t('errors.unknown')}</Text>
          </View>
        ) : quote && !quote.eligible ? (
          <View style={styles.errorRow}>
            <Ionicons name="information-circle" size={18} color={colors.warning} />
            <Text style={styles.ineligibleText}>
              {t(`settlements.instant.ineligible.${quote.ineligibleReason ?? 'already_settled'}`, {
                min: formatPaise(INSTANT_SETTLEMENT_MIN_PAISE, { decimals: false }),
              })}
            </Text>
          </View>
        ) : quote ? (
          <>
            <View style={styles.breakdown}>
              <Row label={t('settlements.instant.netLabel')} amount={quote.netAmount} />
              <Row
                label={t('settlements.instant.feeLabel', { percent: feePercent })}
                amount={-quote.feeAmount}
                tone="error"
                bordered
              />
              <Row label={t('settlements.instant.gstLabel')} amount={-quote.gstAmount} tone="error" bordered />
              <Row
                label={t('settlements.instant.payoutLabel')}
                amount={quote.payoutAmount}
                tone="success"
                emphasis
                bordered
              />
            </View>

            {error ? (
              <View style={styles.errorRow}>
                <Ionicons name="alert-circle" size={18} color={colors.error} />
                <Text style={styles.errorText}>
                  {t(error.i18nKey, { defaultValue: t('errors.unknown') })}
                </Text>
              </View>
            ) : null}

            {!isOnline ? (
              <View style={styles.errorRow}>
                <Ionicons name="cloud-offline-outline" size={18} color={colors.warning} />
                <Text style={styles.ineligibleText}>{t('settlements.instant.offlineBody')}</Text>
              </View>
            ) : null}

            <PrimaryButton
              label={t('settlements.instant.confirmCta', { amount: formatPaise(quote.payoutAmount) })}
              onPress={() => {
                setError(null);
                settle.mutate();
              }}
              disabled={!isOnline}
              size="lg"
              fullWidth
              iconLeft="flash"
              style={styles.cta}
              testID="instant-settle-confirm"
            />
          </>
        ) : null}

        <GhostButton
          label={t('common.cancel')}
          onPress={close}
          disabled={settle.isPending}
          fullWidth
          style={styles.cancel}
        />
      </View>
    </Modal>
  );
}

function Row({
  label,
  amount,
  tone = 'default',
  emphasis = false,
  bordered = false,
}: {
  label: string;
  amount: number;
  tone?: 'default' | 'success' | 'error';
  emphasis?: boolean;
  bordered?: boolean;
}) {
  return (
    <View style={[styles.row, bordered && styles.rowBordered]}>
      <Text style={[styles.rowLabel, emphasis && styles.rowLabelEmphasis]} numberOfLines={2}>
        {label}
      </Text>
      <AmountDisplay amount={amount} size={emphasis ? 'md' : 'sm'} tone={tone} />
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.overlay },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.lg,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.borderStrong,
    alignSelf: 'center',
    marginVertical: spacing.sm,
  },
  header: { alignItems: 'center', marginBottom: spacing.md },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { ...typography.bodyLarge, color: colors.text, marginTop: spacing.sm },
  body: {
    ...typography.small,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xxs,
    maxWidth: 320,
  },
  centered: { alignItems: 'center', paddingVertical: spacing.lg, gap: spacing.sm },
  processing: { ...typography.small, color: colors.textSecondary },
  breakdown: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  rowBordered: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  rowLabel: { ...typography.small, color: colors.textSecondary, flex: 1 },
  rowLabelEmphasis: { ...typography.smallMedium, color: colors.text },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
  },
  errorText: { ...typography.caption, color: colors.error, flex: 1 },
  ineligibleText: { ...typography.caption, color: colors.warning, flex: 1 },
  cta: { marginTop: spacing.md },
  cancel: { marginTop: spacing.xs },
});
