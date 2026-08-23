import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, BackHandler, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, spacing, typography } from '@theme/index';
import { ErrorState, ProgressSteps, Screen } from '@components/index';
import { merchantApi } from '@api/index';
import { ApiError } from '@api/errors';
import { useAuthStore } from '@store/authStore';
import { useNetworkStatus } from '@hooks/useNetworkStatus';
import {
  KYC_FORM_STEP_COUNT,
  KycStep,
  type AadhaarEkycStepData,
  type BankAccountStepData,
  type BusinessInfoStepData,
  type IdentityStepData,
  type KycStepPatch,
} from '@models/kyc';
import type { OnboardingStackParamList } from '@app/navigation/types';
import { BusinessInfoStep } from './steps/BusinessInfoStep';
import { IdentityStep } from './steps/IdentityStep';
import { BankAccountStep } from './steps/BankAccountStep';
import { AadhaarStep } from './steps/AadhaarStep';
import { useKycDraft } from './useKycDraft';

type Nav = NativeStackNavigationProp<OnboardingStackParamList, 'KycWizard'>;

/**
 * Section 6.4 Onboarding / KYC — multi-step wizard host.
 *
 * Owns the progress indicator, the resumable draft, and the `PATCH /merchant/kyc`
 * call for each step. Steps themselves are pure forms: they receive their initial
 * values and hand back validated data, which keeps the persistence and error
 * handling in one place instead of duplicated four times.
 *
 * Back-navigation is intercepted (hardware and on-screen) so the merchant steps
 * *backwards through the wizard* rather than exiting it — leaving mid-KYC would
 * drop them at a screen they have no permission to use yet.
 */
export function KycWizardScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<Nav>();
  const { isOnline } = useNetworkStatus();
  const refreshMerchant = useAuthStore((s) => s.refreshMerchant);
  const { draft, isLoaded, completeStep, goToStep } = useKycDraft();

  const [stepError, setStepError] = useState<ApiError | null>(null);

  const currentStep = draft.currentStep;

  /** Saves one step, then advances the local draft on success. */
  const saveStep = useMutation({
    mutationFn: (patch: KycStepPatch) => merchantApi.saveKycStep(patch),
    onError: (error) => setStepError(error instanceof ApiError ? error : null),
  });

  const submitKyc = useMutation({
    mutationFn: () => merchantApi.submitKyc(),
    onSuccess: async () => {
      // Pull the updated kycStatus so the root gate knows onboarding is done.
      await refreshMerchant();
      navigation.replace('KycDone');
    },
    onError: (error) => setStepError(error instanceof ApiError ? error : null),
  });

  /* ------------------------------ back handling ---------------------------- */

  const goBackAStep = useCallback((): boolean => {
    if (currentStep > KycStep.BusinessInfo) {
      void goToStep((currentStep - 1) as KycStep);
      return true;
    }
    return false;
  }, [currentStep, goToStep]);

  useFocusEffect(
    useCallback(() => {
      const onBack = () => {
        if (goBackAStep()) return true;
        // On the first step, confirm before abandoning — the draft is kept, so
        // this is genuinely "save & exit" rather than data loss.
        Alert.alert(t('kyc.title'), t('kyc.resumeBody', { step: currentStep }), [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('common.ok') },
        ]);
        return true;
      };
      const subscription = BackHandler.addEventListener('hardwareBackPress', onBack);
      return () => subscription.remove();
    }, [goBackAStep, currentStep, t]),
  );

  /* ------------------------------ step handlers --------------------------- */

  const handleBusinessInfo = (data: BusinessInfoStepData) => {
    setStepError(null);
    saveStep.mutate(
      { step: KycStep.BusinessInfo, data },
      { onSuccess: () => void completeStep(KycStep.BusinessInfo, 'businessInfo', data) },
    );
  };

  const handleIdentity = (data: IdentityStepData) => {
    setStepError(null);
    saveStep.mutate(
      { step: KycStep.Identity, data },
      { onSuccess: () => void completeStep(KycStep.Identity, 'identity', data) },
    );
  };

  const handleBankAccount = (data: BankAccountStepData) => {
    setStepError(null);
    saveStep.mutate(
      { step: KycStep.BankAccount, data },
      {
        onSuccess: async () => {
          await completeStep(KycStep.BankAccount, 'bankAccount', data);
          // Payments unlock here under progressive KYC, so refresh the merchant
          // record to pick up the freshly issued VPA.
          await refreshMerchant();
        },
      },
    );
  };

  const handleAadhaar = (data: AadhaarEkycStepData) => {
    setStepError(null);
    saveStep.mutate(
      { step: KycStep.AadhaarEkyc, data },
      {
        onSuccess: async () => {
          await completeStep(KycStep.AadhaarEkyc, 'aadhaar', data);
          submitKyc.mutate();
        },
      },
    );
  };

  /** "Do this later" — submit for manual review without eKYC. */
  const handleSkipAadhaar = () => {
    setStepError(null);
    submitKyc.mutate();
  };

  /* --------------------------------- render ------------------------------- */

  if (!isLoaded) {
    return (
      <Screen>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} accessibilityLabel={t('a11y.loading')} />
        </View>
      </Screen>
    );
  }

  const isSubmitting = saveStep.isPending || submitKyc.isPending;
  const stepIndex = Math.min(currentStep, KYC_FORM_STEP_COUNT);

  return (
    <Screen scroll keyboardAvoiding padded={false} testID="kyc-wizard">
      <View style={styles.header}>
        <Pressable
          onPress={() => {
            if (!goBackAStep()) return;
          }}
          disabled={currentStep === KycStep.BusinessInfo || isSubmitting}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={t('a11y.back')}
          style={styles.backButton}
        >
          <Ionicons
            name="arrow-back"
            size={24}
            color={currentStep === KycStep.BusinessInfo ? colors.disabled : colors.text}
          />
        </Pressable>

        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>{t('kyc.title')}</Text>
          <Text style={styles.headerStep}>
            {t('kyc.stepOf', { current: stepIndex, total: KYC_FORM_STEP_COUNT })}
          </Text>
        </View>
      </View>

      <ProgressSteps
        current={stepIndex}
        completedThrough={draft.completedThrough}
        labels={[
          t('kyc.progress.business'),
          t('kyc.progress.identity'),
          t('kyc.progress.bank'),
          t('kyc.progress.aadhaar'),
        ]}
      />

      {!isOnline ? (
        <View style={styles.offlineNote}>
          <Ionicons name="cloud-offline-outline" size={16} color={colors.warning} />
          <Text style={styles.offlineText}>{t('network.offlineActionDisabled')}</Text>
        </View>
      ) : null}

      <View style={styles.body}>
        {stepError && stepError.code === 'server_error' ? (
          <ErrorState error={stepError} onRetry={() => setStepError(null)} compact />
        ) : null}

        {currentStep === KycStep.BusinessInfo ? (
          <BusinessInfoStep
            initial={draft.businessInfo}
            onSubmit={handleBusinessInfo}
            isSubmitting={isSubmitting}
          />
        ) : null}

        {currentStep === KycStep.Identity ? (
          <IdentityStep initial={draft.identity} onSubmit={handleIdentity} isSubmitting={isSubmitting} />
        ) : null}

        {currentStep === KycStep.BankAccount ? (
          <BankAccountStep
            initial={draft.bankAccount}
            onSubmit={handleBankAccount}
            isSubmitting={isSubmitting}
          />
        ) : null}

        {currentStep >= KycStep.AadhaarEkyc ? (
          <AadhaarStep onSubmit={handleAadhaar} onSkip={handleSkipAadhaar} isSubmitting={isSubmitting} />
        ) : null}

        {/*
          Field-level failures (bad PAN, penny-drop returned) are shown here
          rather than inside each step, since they arrive from the server after
          the form has already passed local validation.
        */}
        {stepError && stepError.code !== 'server_error' ? (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle" size={18} color={colors.error} />
            <Text style={styles.errorText}>
              {t(stepError.i18nKey, { defaultValue: t('errors.unknown') })}
            </Text>
          </View>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.xs, paddingTop: spacing.xs },
  backButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerText: { flex: 1 },
  headerTitle: { ...typography.bodyMedium, color: colors.text },
  headerStep: { ...typography.caption, color: colors.textTertiary },
  offlineNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.warningLight,
    marginHorizontal: spacing.md,
    borderRadius: 8,
    padding: spacing.xs,
  },
  offlineText: { ...typography.caption, color: colors.warning, flex: 1 },
  body: { paddingHorizontal: spacing.md, paddingTop: spacing.lg },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.errorLight,
    borderRadius: 10,
    padding: spacing.sm,
    marginTop: spacing.md,
  },
  errorText: { ...typography.small, color: colors.error, flex: 1 },
});
