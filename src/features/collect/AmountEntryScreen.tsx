import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, radius, spacing, typography } from '@theme/index';
import { AmountInput, PrimaryButton, Screen, TextField } from '@components/index';
import { paymentsApi } from '@api/index';
import { ApiError } from '@api/errors';
import { useAuthStore } from '@store/authStore';
import { useNetworkStatus } from '@hooks/useNetworkStatus';
import { formatPaise } from '@utils/money';
import { paiseProp, track } from '@utils/analytics';
import { PROGRESSIVE_KYC_DAILY_LIMIT } from '@api/mocks/db';
import type { CollectStackParamList } from '@app/navigation/types';
import { tapFeedback } from './audioConfirmation';
import { ScreenHeader } from './ScreenHeader';

type Nav = NativeStackNavigationProp<CollectStackParamList, 'AmountEntry'>;
type Route = RouteProp<CollectStackParamList, 'AmountEntry'>;

/** Smallest accepted payment: ₹1. */
const MIN_AMOUNT_PAISE = 100;

/**
 * Section 6.6 mode B/C — amount entry.
 *
 * One screen serves both the dynamic QR and the payment link, since the input is
 * identical (amount + optional note) and only the terminal call differs. The
 * `mode` route param decides which.
 *
 * The daily cap for an unapproved merchant is enforced here as well as on the
 * server: catching it before the request means the merchant is told *why* while
 * they are still looking at the keypad, instead of after a round-trip.
 */
export function AmountEntryScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Route>();
  const mode = params?.mode ?? 'qr';

  const merchant = useAuthStore((s) => s.merchant);
  const { isOnline } = useNetworkStatus();

  const [amount, setAmount] = useState(0);
  const [note, setNote] = useState('');
  const [submitError, setSubmitError] = useState<ApiError | null>(null);

  /** Progressive KYC (Section 6.4) caps collections until approval. */
  const cap = useMemo(
    () => (merchant?.kycStatus === 'approved' ? undefined : PROGRESSIVE_KYC_DAILY_LIMIT),
    [merchant?.kycStatus],
  );

  const createQr = useMutation({
    mutationFn: () =>
      paymentsApi.createDynamicQr({ amount, ...(note.trim() ? { note: note.trim() } : {}) }),
    onSuccess: (data) => {
      track('qr_generated', { amount: paiseProp(amount), has_note: !!note.trim() });
      // `replace`: the merchant should not land back on a stale keypad when
      // backing out of the QR screen.
      navigation.replace('QRScreen', {
        ref: data.ref,
        amount,
        qrPayload: data.qrPayload,
        expiresAt: data.expiresAt,
      });
    },
    onError: (error) => setSubmitError(error instanceof ApiError ? error : null),
  });

  const createLink = useMutation({
    mutationFn: () =>
      paymentsApi.createPaymentLink({ amount, ...(note.trim() ? { note: note.trim() } : {}) }),
    onSuccess: (data) => {
      track('payment_link_created', { amount: paiseProp(amount) });
      navigation.replace('PaymentLink', { url: data.url, amount, expiresAt: data.expiresAt });
    },
    onError: (error) => setSubmitError(error instanceof ApiError ? error : null),
  });

  const isPending = createQr.isPending || createLink.isPending;

  const belowMinimum = amount > 0 && amount < MIN_AMOUNT_PAISE;
  const overCap = !!cap && amount > cap;
  const canSubmit = amount >= MIN_AMOUNT_PAISE && !overCap && isOnline && !isPending;

  const amountError = belowMinimum
    ? t('collect.amount.tooLow', { min: formatPaise(MIN_AMOUNT_PAISE, { decimals: false }) })
    : overCap
      ? t('collect.amount.limitExceeded', { limit: formatPaise(cap, { decimals: false }) })
      : undefined;

  const submit = () => {
    setSubmitError(null);
    if (mode === 'qr') createQr.mutate();
    else createLink.mutate();
  };

  return (
    <Screen scroll keyboardAvoiding testID="amount-entry-screen">
      <ScreenHeader
        title={mode === 'qr' ? t('collect.amount.title') : t('collect.link.title')}
        onBack={() => navigation.goBack()}
      />

      <AmountInput
        value={amount}
        onChange={setAmount}
        onKeyPress={tapFeedback}
        error={amountError}
        helper={
          cap
            ? t('collect.amount.limitExceeded', { limit: formatPaise(cap, { decimals: false }) })
            : undefined
        }
        {...(cap ? { maxAmount: cap } : {})}
        disabled={isPending}
        testID="amount-input"
      />

      <View style={styles.noteWrapper}>
        <TextField
          label={t('collect.amount.noteLabel')}
          optionalLabel={t('common.optional')}
          placeholder={t('collect.amount.notePlaceholder')}
          value={note}
          onChangeText={setNote}
          maxLength={60}
          editable={!isPending}
          testID="amount-note-input"
        />
      </View>

      {submitError ? (
        <View style={styles.errorBanner}>
          <Ionicons name="alert-circle" size={18} color={colors.error} />
          <Text style={styles.errorText}>
            {t(submitError.i18nKey, { defaultValue: t('errors.unknown') })}
          </Text>
        </View>
      ) : null}

      {!isOnline ? (
        <View style={styles.offlineBanner}>
          <Ionicons name="cloud-offline-outline" size={18} color={colors.warning} />
          <Text style={styles.offlineText}>{t('collect.dynamicQr.offlineBody')}</Text>
        </View>
      ) : null}

      <PrimaryButton
        label={mode === 'qr' ? t('collect.amount.generateQr') : t('collect.amount.createLink')}
        onPress={submit}
        loading={isPending}
        disabled={!canSubmit}
        iconLeft={mode === 'qr' ? 'qr-code-outline' : 'link-outline'}
        size="lg"
        fullWidth
        style={styles.cta}
        testID="amount-submit-button"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  noteWrapper: { marginTop: spacing.lg },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.errorLight,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  errorText: { ...typography.small, color: colors.error, flex: 1 },
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.warningLight,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  offlineText: { ...typography.caption, color: colors.warning, flex: 1 },
  cta: { marginTop: spacing.md },
});
