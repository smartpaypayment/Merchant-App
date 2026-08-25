import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, radius, spacing, typography, MIN_TOUCH_TARGET } from '@theme/index';
import {
  AmountDisplay,
  AmountInput,
  EmptyState,
  ErrorState,
  ListSkeleton,
  PrimaryButton,
  ReauthSheet,
  Screen,
  SecondaryButton,
  TextField,
} from '@components/index';
import { transactionsApi } from '@api/index';
import { ApiError } from '@api/errors';
import { queryKeys } from '@app/providers/queryClient';
import { useNetworkStatus } from '@hooks/useNetworkStatus';
import { formatPaise } from '@utils/money';
import { paiseProp, track } from '@utils/analytics';
import { tapFeedback } from '@features/collect/audioConfirmation';
import type { Paise } from '@models/index';
import type { TransactionsStackParamList } from '@app/navigation/types';
import { ScreenHeader } from '@features/collect/ScreenHeader';
import {
  getRefundEligibility,
  MIN_REFUND_PAISE,
  validateRefundAmount,
} from '@features/transactions/refundEligibility';

type Nav = NativeStackNavigationProp<TransactionsStackParamList, 'Refund'>;
type Route = RouteProp<TransactionsStackParamList, 'Refund'>;

type RefundType = 'full' | 'partial';
type Phase = 'entry' | 'processing' | 'success';

/**
 * Section 6.10 Refund Screen.
 *
 * Full or partial, optional reason, confirmed with app PIN or biometric.
 *
 * The re-auth gate (Section 12) sits between the merchant pressing Confirm and the
 * request being sent — `ReauthSheet` resolving successfully is the only path that
 * calls the mutation. Money never moves on the strength of a single tap.
 *
 * Refund mutations are never auto-retried (see `queryClient`): a blind retry on a
 * network blip could double-refund a customer. On failure the merchant is shown
 * the reason and decides.
 */
export function RefundScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Route>();
  const queryClient = useQueryClient();
  const { isOnline } = useNetworkStatus();

  const [refundType, setRefundType] = useState<RefundType>('full');
  const [partialAmount, setPartialAmount] = useState<Paise>(0);
  const [reason, setReason] = useState('');
  const [phase, setPhase] = useState<Phase>('entry');
  const [reauthVisible, setReauthVisible] = useState(false);
  const [submitError, setSubmitError] = useState<ApiError | null>(null);

  const txnQuery = useQuery({
    queryKey: queryKeys.transaction(params.id),
    queryFn: () => transactionsApi.getTransaction(params.id),
  });

  const transaction = txnQuery.data;
  const eligibility = useMemo(
    () => (transaction ? getRefundEligibility(transaction) : null),
    [transaction],
  );

  /** The amount that will actually be sent. */
  const refundAmount: Paise =
    refundType === 'full' ? (eligibility?.refundable ?? 0) : partialAmount;

  const validation = eligibility ? validateRefundAmount(refundAmount, eligibility) : 'below_minimum';

  const amountError =
    refundType === 'partial' && partialAmount > 0 && validation !== 'ok'
      ? validation === 'exceeds_refundable'
        ? t('refund.exceedsRefundable', {
            max: formatPaise(eligibility?.refundable ?? 0, { decimals: false }),
          })
        : t('refund.tooLow', { min: formatPaise(MIN_REFUND_PAISE, { decimals: false }) })
      : undefined;

  const refund = useMutation({
    mutationFn: () =>
      transactionsApi.refundTransaction(params.id, {
        amount: refundAmount,
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      }),
    onMutate: () => {
      setPhase('processing');
      setSubmitError(null);
    },
    onSuccess: () => {
      track('refund_initiated', {
        amount: paiseProp(refundAmount),
        type: refundType,
        has_reason: !!reason.trim(),
      });

      // The transaction, the list, and today's totals are all now stale.
      void queryClient.invalidateQueries({ queryKey: queryKeys.transaction(params.id) });
      void queryClient.invalidateQueries({ queryKey: ['transactions'] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });

      setPhase('success');
    },
    onError: (error) => {
      setSubmitError(error instanceof ApiError ? error : null);
      setPhase('entry');
    },
  });

  const canSubmit = isOnline && validation === 'ok' && phase === 'entry';

  /* --------------------------------- states -------------------------------- */

  if (txnQuery.isLoading) {
    return (
      <Screen testID="refund-screen">
        <ScreenHeader title={t('refund.title')} onBack={() => navigation.goBack()} />
        <ListSkeleton count={4} />
      </Screen>
    );
  }

  if (txnQuery.isError || !transaction || !eligibility) {
    return (
      <Screen testID="refund-screen">
        <ScreenHeader title={t('refund.title')} onBack={() => navigation.goBack()} />
        <ErrorState error={txnQuery.error} onRetry={() => void txnQuery.refetch()} />
      </Screen>
    );
  }

  // Guarded here as well as on the detail screen: a stale list could route the
  // merchant to a refund that another device already completed.
  if (!eligibility.eligible) {
    return (
      <Screen testID="refund-screen">
        <ScreenHeader title={t('refund.title')} onBack={() => navigation.goBack()} />
        <EmptyState
          icon="close-circle-outline"
          title={t('refund.notEligibleTitle')}
          body={t('refund.notEligibleBody')}
          ctaLabel={t('common.back')}
          onCtaPress={() => navigation.goBack()}
        />
      </Screen>
    );
  }

  if (phase === 'processing') {
    return (
      <Screen testID="refund-screen">
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.processingTitle}>{t('refund.processingTitle')}</Text>
          <Text style={styles.processingBody}>{t('refund.processingBody')}</Text>
        </View>
      </Screen>
    );
  }

  if (phase === 'success') {
    return (
      <Screen scroll testID="refund-screen">
        <View style={styles.successBlock}>
          <View style={styles.successCircle}>
            <Ionicons name="checkmark" size={48} color={colors.textInverse} />
          </View>
          <Text style={styles.successTitle}>{t('refund.successTitle')}</Text>
          <Text style={styles.successBody}>
            {t('refund.successBody', { amount: formatPaise(refundAmount) })}
          </Text>
          <PrimaryButton
            label={t('refund.successDone')}
            onPress={() => navigation.goBack()}
            size="lg"
            fullWidth
            style={styles.successCta}
            testID="refund-done"
          />
        </View>
      </Screen>
    );
  }

  /* ---------------------------------- entry -------------------------------- */

  return (
    <Screen scroll keyboardAvoiding testID="refund-screen">
      <ScreenHeader title={t('refund.title')} onBack={() => navigation.goBack()} />

      {/* Original payment context, so the merchant can confirm they picked the
          right transaction before moving money. */}
      <View style={styles.originalCard}>
        <Text style={styles.originalLabel}>{t('refund.originalLabel')}</Text>
        <AmountDisplay amount={transaction.amount} size="lg" />
        <Text style={styles.refundableLabel}>
          {t('refund.refundableLabel')}: {formatPaise(eligibility.refundable)}
        </Text>
        {eligibility.alreadyRefunded > 0 ? (
          <View style={styles.alreadyRow}>
            <Ionicons name="information-circle-outline" size={14} color={colors.info} />
            <Text style={styles.alreadyText}>
              {t('refund.alreadyRefunded', { amount: formatPaise(eligibility.alreadyRefunded) })}
            </Text>
          </View>
        ) : null}
      </View>

      {/* Full vs partial */}
      <View style={styles.typeRow}>
        {(['full', 'partial'] as const).map((type) => {
          const selected = refundType === type;
          return (
            <Pressable
              key={type}
              onPress={() => {
                setRefundType(type);
                if (type === 'partial' && partialAmount === 0) setPartialAmount(0);
              }}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              style={({ pressed }) => [
                styles.typeCard,
                selected && styles.typeCardSelected,
                pressed && styles.pressed,
              ]}
              testID={`refund-type-${type}`}
            >
              <Ionicons
                name={selected ? 'radio-button-on' : 'radio-button-off'}
                size={20}
                color={selected ? colors.primary : colors.textTertiary}
              />
              <View style={styles.typeBody}>
                <Text style={[styles.typeTitle, selected && styles.typeTitleSelected]}>
                  {t(type === 'full' ? 'refund.typeFull' : 'refund.typePartial')}
                </Text>
                <Text style={styles.typeSubtitle}>
                  {t(type === 'full' ? 'refund.fullBody' : 'refund.partialBody')}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      {refundType === 'partial' ? (
        <View style={styles.amountBlock}>
          <Text style={styles.amountLabel}>{t('refund.amountLabel')}</Text>
          <AmountInput
            value={partialAmount}
            onChange={setPartialAmount}
            onKeyPress={tapFeedback}
            maxAmount={eligibility.refundable}
            error={amountError}
            testID="refund-amount-input"
          />
        </View>
      ) : null}

      <View style={styles.reasonBlock}>
        <TextField
          label={t('refund.reasonLabel')}
          optionalLabel={t('common.optional')}
          placeholder={t('refund.reasonPlaceholder')}
          value={reason}
          onChangeText={setReason}
          maxLength={120}
          multiline
          testID="refund-reason-input"
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
          <Text style={styles.offlineText}>{t('refund.offlineBody')}</Text>
        </View>
      ) : null}

      <PrimaryButton
        label={t('refund.confirmCta', { amount: formatPaise(refundAmount) })}
        // Opens the re-auth gate; the mutation only runs on its success callback.
        onPress={() => setReauthVisible(true)}
        disabled={!canSubmit}
        size="lg"
        fullWidth
        iconLeft="lock-closed-outline"
        style={styles.cta}
        testID="refund-confirm-button"
      />

      <SecondaryButton
        label={t('common.cancel')}
        onPress={() => navigation.goBack()}
        fullWidth
        style={styles.cancelCta}
      />

      <ReauthSheet
        visible={reauthVisible}
        reason={t('refund.reauthReason', { amount: formatPaise(refundAmount) })}
        onSuccess={() => {
          setReauthVisible(false);
          refund.mutate();
        }}
        onCancel={() => setReauthVisible(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  processingTitle: { ...typography.bodyLarge, color: colors.text, marginTop: spacing.md },
  processingBody: { ...typography.small, color: colors.textSecondary, marginTop: spacing.xxs },
  originalCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  originalLabel: { ...typography.caption, color: colors.textTertiary },
  refundableLabel: { ...typography.small, color: colors.textSecondary, marginTop: spacing.xs },
  alreadyRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxs, marginTop: spacing.xs },
  alreadyText: { ...typography.caption, color: colors.info },
  typeRow: { gap: spacing.sm },
  typeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: MIN_TOUCH_TARGET + 12,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  typeCardSelected: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  pressed: { opacity: 0.75 },
  typeBody: { flex: 1 },
  typeTitle: { ...typography.bodyMedium, color: colors.text },
  typeTitleSelected: { color: colors.primary },
  typeSubtitle: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  amountBlock: { marginTop: spacing.lg },
  amountLabel: { ...typography.smallMedium, color: colors.textSecondary },
  reasonBlock: { marginTop: spacing.lg },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.errorLight,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  errorText: { ...typography.small, color: colors.error, flex: 1 },
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.warningLight,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  offlineText: { ...typography.caption, color: colors.warning, flex: 1 },
  cta: { marginTop: spacing.md },
  cancelCta: { marginTop: spacing.sm },
  successBlock: { alignItems: 'center', paddingTop: spacing.xxl },
  successCircle: {
    width: 96,
    height: 96,
    borderRadius: radius.pill,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successTitle: { ...typography.heading, color: colors.text, marginTop: spacing.lg },
  successBody: {
    ...typography.small,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xs,
    maxWidth: 320,
  },
  successCta: { marginTop: spacing.xl },
});
