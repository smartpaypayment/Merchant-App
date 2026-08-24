import { useEffect, useRef } from 'react';
import { Animated, Easing, Share, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, radius, spacing, typography } from '@theme/index';
import { AmountDisplay, GhostButton, PrimaryButton, Screen, SecondaryButton } from '@components/index';
import { useAuthStore } from '@store/authStore';
import { formatPaise } from '@utils/money';
import { formatTime } from '@utils/date';
import type { CollectStackParamList } from '@app/navigation/types';
import { announcePayment, settingsFromPreferences, stopAnnouncement } from './audioConfirmation';

type Nav = NativeStackNavigationProp<CollectStackParamList, 'PaymentSuccess'>;
type Route = RouteProp<CollectStackParamList, 'PaymentSuccess'>;

/**
 * Section 6.7 Payment Success Screen.
 *
 * "Big green check, amount, txn ID, timestamp, payer VPA (masked). Audio
 * auto-plays in selected language. Actions: Share receipt, New payment, Done."
 *
 * On the dynamic-QR path the announcement has already fired in `DynamicQRScreen`
 * at detection time, so `announceOnMount` is false there. It is true when this
 * screen is reached from a push/deep link, where this is the first UI to appear.
 * Either way the announcement happens exactly once — `usePaymentStatus` also
 * dedupes by ref, per Section 10's idempotency requirement.
 */
export function PaymentSuccessScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Route>();
  const merchant = useAuthStore((s) => s.merchant);

  const { amount, transactionId, utr, payerVpaMasked, createdAt, announceOnMount } = params;

  const scale = useRef(new Animated.Value(0.4)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  // Section 6.6: "success (animation + audio)".
  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, friction: 5, tension: 90, useNativeDriver: true }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();
  }, [scale, opacity]);

  useEffect(() => {
    if (announceOnMount) {
      announcePayment(amount, settingsFromPreferences(merchant?.preferences));
    }
    // Leaving the screen should cut off a long announcement mid-word rather than
    // letting it talk over the next screen.
    return stopAnnouncement;
  }, [announceOnMount, amount, merchant?.preferences]);

  const shareReceipt = async () => {
    try {
      await Share.share({
        message: t('collect.success.receiptMessage', {
          amount: formatPaise(amount),
          time: formatTime(createdAt),
          id: transactionId ?? '-',
        }),
      });
    } catch {
      /* Sheet dismissed. */
    }
  };

  const rows: { label: string; value: string }[] = [
    ...(transactionId ? [{ label: t('collect.success.txnIdLabel'), value: transactionId }] : []),
    ...(utr ? [{ label: t('collect.success.utrLabel'), value: utr }] : []),
    ...(payerVpaMasked ? [{ label: t('collect.success.payerLabel'), value: payerVpaMasked }] : []),
    { label: t('collect.success.timeLabel'), value: formatTime(createdAt) },
  ];

  const audioMuted = merchant?.preferences?.audioConfirmation.enabled === false;

  return (
    <Screen scroll testID="payment-success-screen">
      <View style={styles.hero}>
        <Animated.View style={[styles.checkCircle, { transform: [{ scale }] }]}>
          <Ionicons name="checkmark" size={56} color={colors.textInverse} />
        </Animated.View>

        <Animated.View style={{ opacity }}>
          <Text style={styles.title} accessibilityRole="header">
            {t('collect.success.title')}
          </Text>
          <Text style={styles.amountLabel}>{t('collect.success.amountLabel')}</Text>
          <AmountDisplay
            amount={amount}
            size="hero"
            tone="success"
            style={styles.amount}
            testID="success-amount"
          />
        </Animated.View>
      </View>

      <View style={styles.detailCard}>
        {rows.map((row, index) => (
          <View key={row.label} style={[styles.detailRow, index > 0 && styles.detailRowBordered]}>
            <Text style={styles.detailLabel}>{row.label}</Text>
            <Text style={styles.detailValue} numberOfLines={1} selectable>
              {row.value}
            </Text>
          </View>
        ))}
      </View>

      {audioMuted ? (
        <View style={styles.mutedHint}>
          <Ionicons name="volume-mute-outline" size={16} color={colors.textTertiary} />
          <Text style={styles.mutedHintText}>{t('collect.audio.mutedHint')}</Text>
        </View>
      ) : null}

      <View style={styles.actions}>
        <PrimaryButton
          label={t('collect.success.newPayment')}
          onPress={() => navigation.replace('AmountEntry', { mode: 'qr' })}
          iconLeft="add-circle-outline"
          size="lg"
          fullWidth
          testID="success-new-payment"
        />
        <SecondaryButton
          label={t('collect.success.shareReceipt')}
          onPress={() => void shareReceipt()}
          iconLeft="share-social-outline"
          fullWidth
          style={styles.secondaryAction}
          testID="success-share-receipt"
        />
        <GhostButton
          label={t('collect.success.done')}
          onPress={() => navigation.navigate('CollectPayment')}
          fullWidth
          style={styles.secondaryAction}
          testID="success-done"
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', paddingTop: spacing.xl },
  checkCircle: {
    width: 96,
    height: 96,
    borderRadius: radius.pill,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { ...typography.heading, color: colors.success, textAlign: 'center', marginTop: spacing.md },
  amountLabel: {
    ...typography.caption,
    color: colors.textTertiary,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  amount: { textAlign: 'center' },
  detailCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: spacing.xl,
    paddingHorizontal: spacing.md,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  detailRowBordered: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  detailLabel: { ...typography.small, color: colors.textSecondary },
  detailValue: { ...typography.smallMedium, color: colors.text, flexShrink: 1, textAlign: 'right' },
  mutedHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.md,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
  },
  mutedHintText: { ...typography.caption, color: colors.textTertiary, flex: 1 },
  actions: { marginTop: spacing.xl },
  secondaryAction: { marginTop: spacing.sm },
});
