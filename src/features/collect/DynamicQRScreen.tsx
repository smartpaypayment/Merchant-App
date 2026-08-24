import { useCallback, useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, radius, spacing, typography } from '@theme/index';
import { AmountDisplay, GhostButton, PrimaryButton, QRDisplay, Screen } from '@components/index';
import { queryKeys } from '@app/providers/queryClient';
import { useAuthStore } from '@store/authStore';
import { useCountdown } from '@hooks/useCountdown';
import { formatCountdown, secondsUntil } from '@utils/date';
import { paiseProp, track } from '@utils/analytics';
import type { CollectStackParamList } from '@app/navigation/types';
import { announcePayment, settingsFromPreferences } from './audioConfirmation';
import { usePaymentStatus } from './usePaymentStatus';
import { ScreenHeader } from './ScreenHeader';

type Nav = NativeStackNavigationProp<CollectStackParamList, 'QRScreen'>;
type Route = RouteProp<CollectStackParamList, 'QRScreen'>;

/**
 * Section 6.6 mode B — the dynamic QR with live status.
 *
 * "Shows QR with amount, live status ('Waiting for payment…'). On payment
 * received: switch to success screen + play audio + haptic."
 *
 * The audio announcement fires **here**, at the moment of detection, rather than
 * on the success screen. That ordering is deliberate: it is what keeps the
 * Section 15 target of audio within ~5s of payment honest, since it does not wait
 * on a screen transition or a mount. It also means the merchant hears the
 * confirmation even if they are not looking at the phone at all — the entire
 * point of the soundbox behaviour in PRD SND-1.
 */
export function DynamicQRScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Route>();
  const queryClient = useQueryClient();
  const merchant = useAuthStore((s) => s.merchant);

  const { ref, amount, qrPayload, expiresAt } = params;

  const expiry = useCountdown(secondsUntil(expiresAt));
  const { state, transaction, consecutiveErrors } = usePaymentStatus(ref, { expiresAt });

  /** Section 6.6/10: on success announce, invalidate caches, show success. */
  useEffect(() => {
    if (state !== 'success') return;

    // Audio + haptic first — before navigating — so there is no transition delay
    // between the money landing and the merchant hearing it.
    announcePayment(amount, settingsFromPreferences(merchant?.preferences));

    track('payment_received', {
      amount: paiseProp(amount),
      mode: 'upi_qr',
      source: 'dynamic_qr',
    });

    // Today's collections and the transaction list are now stale.
    void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
    void queryClient.invalidateQueries({ queryKey: ['transactions'] });

    navigation.replace('PaymentSuccess', {
      amount,
      ...(transaction ? { transactionId: transaction.id } : {}),
      ...(transaction?.utr ? { utr: transaction.utr } : {}),
      ...(transaction?.payerVpaMasked ? { payerVpaMasked: transaction.payerVpaMasked } : {}),
      createdAt: transaction?.createdAt ?? new Date().toISOString(),
    });
  }, [state, amount, transaction, merchant?.preferences, navigation, queryClient]);

  const isExpired = state === 'expired' || (!expiry.isRunning && state === 'waiting');
  const isFailed = state === 'failed';

  const createNew = useCallback(() => {
    navigation.replace('AmountEntry', { mode: 'qr' });
  }, [navigation]);

  return (
    <Screen scroll testID="dynamic-qr-screen">
      <ScreenHeader
        title={t('collect.dynamicQr.title')}
        onBack={() => navigation.goBack()}
        trailing={
          <GhostButton
            label={t('collect.dynamicQr.cancel')}
            onPress={() => navigation.goBack()}
            testID="dynamic-qr-cancel"
          />
        }
      />

      <View style={styles.amountBlock}>
        <AmountDisplay amount={amount} size="hero" testID="dynamic-qr-amount" />
      </View>

      {isFailed ? (
        <View style={styles.terminalState}>
          <View style={[styles.terminalIcon, styles.iconError]}>
            <Ionicons name="close-circle-outline" size={40} color={colors.error} />
          </View>
          <Text style={styles.terminalTitle}>{t('collect.dynamicQr.failedTitle')}</Text>
          <Text style={styles.terminalBody}>{t('collect.dynamicQr.failedBody')}</Text>
          <PrimaryButton
            label={t('collect.dynamicQr.newQr')}
            onPress={createNew}
            size="lg"
            fullWidth
            style={styles.terminalCta}
          />
        </View>
      ) : isExpired ? (
        <View style={styles.terminalState}>
          {/* The expired code stays visible but dimmed, so it is obvious *which*
              QR died rather than the screen simply emptying. */}
          <QRDisplay payload={qrPayload} size={180} dimmed />
          <Text style={styles.terminalTitle}>{t('collect.dynamicQr.expiredTitle')}</Text>
          <Text style={styles.terminalBody}>{t('collect.dynamicQr.expiredBody')}</Text>
          <PrimaryButton
            label={t('collect.dynamicQr.newQr')}
            onPress={createNew}
            iconLeft="refresh"
            size="lg"
            fullWidth
            style={styles.terminalCta}
            testID="dynamic-qr-new"
          />
        </View>
      ) : (
        <>
          <QRDisplay
            payload={qrPayload}
            merchantName={merchant?.businessName}
            size={230}
            testID="dynamic-qr-display"
          />

          <View style={styles.waitingRow}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={styles.waitingText} accessibilityLiveRegion="polite">
              {t('collect.dynamicQr.waiting')}
            </Text>
          </View>

          <Text style={styles.waitingBody}>{t('collect.dynamicQr.waitingBody')}</Text>

          <View style={styles.expiryPill}>
            <Ionicons name="time-outline" size={14} color={colors.textSecondary} />
            <Text style={styles.expiryText}>
              {t('collect.dynamicQr.expiresIn', { time: formatCountdown(expiry.secondsLeft) })}
            </Text>
          </View>

          {/*
            Repeated poll failures mean a flaky connection, not a failed payment.
            Say so rather than silently spinning — but keep polling.
          */}
          {consecutiveErrors >= 2 ? (
            <View style={styles.slowBanner}>
              <Ionicons name="cellular-outline" size={16} color={colors.warning} />
              <Text style={styles.slowText}>{t('collect.dynamicQr.checkingSlowly')}</Text>
            </View>
          ) : null}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  amountBlock: { alignItems: 'center', marginBottom: spacing.md },
  waitingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    marginTop: spacing.lg,
  },
  waitingText: { ...typography.bodyMedium, color: colors.primary },
  waitingBody: {
    ...typography.small,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xxs,
  },
  expiryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: spacing.xxs,
    marginTop: spacing.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
  },
  expiryText: { ...typography.caption, color: colors.textSecondary, fontVariant: ['tabular-nums'] },
  slowBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.md,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.warningLight,
  },
  slowText: { ...typography.caption, color: colors.warning, flex: 1 },
  terminalState: { alignItems: 'center' },
  terminalIcon: {
    width: 80,
    height: 80,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconError: { backgroundColor: colors.errorLight },
  terminalTitle: { ...typography.title, color: colors.text, marginTop: spacing.md },
  terminalBody: {
    ...typography.small,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xxs,
    maxWidth: 300,
  },
  terminalCta: { marginTop: spacing.lg },
});
