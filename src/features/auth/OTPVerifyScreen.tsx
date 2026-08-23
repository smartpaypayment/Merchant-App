import { useCallback, useEffect, useState } from 'react';
import { Keyboard, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation, type RouteProp, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, radius, spacing, typography } from '@theme/index';
import { GhostButton, OTPInput, PrimaryButton, Screen } from '@components/index';
import { authApi } from '@api/index';
import { ApiError } from '@api/errors';
import { useAuthStore } from '@store/authStore';
import { maskMobileForDisplay, OTP_LENGTH } from '@utils/validators';
import { useCountdown } from '@hooks/useCountdown';
import { VALID_OTP } from '@api/mocks/db';
import { env } from '@/config/env';
import type { AuthStackParamList } from '@app/navigation/types';

type Nav = NativeStackNavigationProp<AuthStackParamList, 'OTPVerify'>;
type Route = RouteProp<AuthStackParamList, 'OTPVerify'>;

/**
 * Section 6.3 OTP Verify Screen.
 *
 * UI: 6-digit OTP input (auto-read via SMS retriever where available), 30s resend
 * timer, Verify button.
 * States: entering, verifying, error (wrong OTP), resend countdown.
 *
 * On success the store flips to `authenticated`; `RootNavigator` then mounts the
 * KYC wizard or the main tabs based on `kycStatus`, so this screen performs no
 * imperative routing of its own.
 */
export function OTPVerifyScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Route>();
  const completeLogin = useAuthStore((s) => s.completeLogin);

  const [otp, setOtp] = useState('');
  const [error, setError] = useState<ApiError | null>(null);
  const resend = useCountdown(params.resendAfterSeconds);

  const verify = useMutation({
    mutationFn: (code: string) => authApi.verifyOtp({ mobile: params.mobile, otp: code }),
    onSuccess: async (data) => {
      await completeLogin(
        { accessToken: data.accessToken, refreshToken: data.refreshToken },
        data.isNewUser,
      );
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err : null);
      // Clear the boxes so the merchant retypes rather than editing a wrong code.
      setOtp('');
    },
  });

  const requestAgain = useMutation({
    mutationFn: () => authApi.requestOtp({ mobile: params.mobile }),
    onSuccess: (data) => {
      setError(null);
      setOtp('');
      resend.restart(data.resendAfterSeconds);
    },
    onError: (err) => setError(err instanceof ApiError ? err : null),
  });

  const submit = useCallback(
    (code: string) => {
      if (code.length !== OTP_LENGTH || verify.isPending) return;
      Keyboard.dismiss();
      setError(null);
      verify.mutate(code);
    },
    [verify],
  );

  // Auto-submit the moment the 6th digit lands (typed or SMS-autofilled) so the
  // merchant does not have to reach for Verify.
  useEffect(() => {
    if (otp.length === OTP_LENGTH && !verify.isPending && !error) submit(otp);
  }, [otp, verify.isPending, error, submit]);

  const isBusy = verify.isPending || requestAgain.isPending;

  return (
    <Screen scroll keyboardAvoiding testID="otp-screen">
      <Pressable
        onPress={() => navigation.goBack()}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel={t('a11y.back')}
        style={styles.backButton}
      >
        <Ionicons name="arrow-back" size={24} color={colors.text} />
      </Pressable>

      <View style={styles.header}>
        <Text style={styles.title}>{t('auth.otp.title')}</Text>
        <Text style={styles.subtitle}>
          {t('auth.otp.subtitle', { mobile: maskMobileForDisplay(params.mobile) })}
        </Text>
      </View>

      <OTPInput
        value={otp}
        onChange={(next) => {
          setOtp(next);
          if (error) setError(null);
        }}
        onComplete={submit}
        length={OTP_LENGTH}
        hasError={!!error}
        editable={!isBusy}
        accessibilityLabel={t('auth.otp.title')}
        testID="otp-input"
      />

      {error ? (
        <View style={styles.errorBanner}>
          <Ionicons name="alert-circle" size={18} color={colors.error} />
          <Text style={styles.errorText}>
            {t(error.i18nKey, { defaultValue: t('errors.unknown') })}
          </Text>
        </View>
      ) : (
        <View style={styles.hintRow}>
          <Ionicons name="chatbox-ellipses-outline" size={14} color={colors.textTertiary} />
          <Text style={styles.hint}>{t('auth.otp.autoReadHint')}</Text>
        </View>
      )}

      <PrimaryButton
        label={t('auth.otp.verify')}
        onPress={() => submit(otp)}
        loading={verify.isPending}
        disabled={otp.length !== OTP_LENGTH}
        size="lg"
        fullWidth
        style={styles.cta}
        testID="otp-verify-button"
      />

      <View style={styles.resendRow}>
        {resend.isRunning ? (
          <Text style={styles.resendTimer}>
            {t('auth.otp.resendIn', { seconds: resend.secondsLeft })}
          </Text>
        ) : (
          <GhostButton
            label={t('auth.otp.resend')}
            onPress={() => requestAgain.mutate()}
            loading={requestAgain.isPending}
            iconLeft="refresh"
            testID="otp-resend-button"
          />
        )}
      </View>

      <View style={styles.changeNumberRow}>
        <GhostButton label={t('auth.otp.changeNumber')} onPress={() => navigation.goBack()} />
      </View>

      {/*
        Mock mode has no SMS channel, so the accepted code is surfaced in-app.
        Gated on `useMockApi` — it cannot render against a real backend.
      */}
      {env.useMockApi ? (
        <View style={styles.devHint}>
          <Ionicons name="information-circle-outline" size={16} color={colors.info} />
          <Text style={styles.devHintText}>{t('auth.otp.hintDev', { otp: VALID_OTP })}</Text>
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  backButton: { width: 44, height: 44, justifyContent: 'center', marginTop: spacing.xs },
  header: { marginTop: spacing.md, marginBottom: spacing.xl },
  title: { ...typography.heading, color: colors.text },
  subtitle: { ...typography.small, color: colors.textSecondary, marginTop: spacing.xxs },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.errorLight,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginTop: spacing.md,
  },
  errorText: { ...typography.small, color: colors.error, flex: 1 },
  hintRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxs, marginTop: spacing.md },
  hint: { ...typography.caption, color: colors.textTertiary, flex: 1 },
  cta: { marginTop: spacing.lg },
  resendRow: { alignItems: 'center', marginTop: spacing.md, minHeight: 48, justifyContent: 'center' },
  resendTimer: { ...typography.small, color: colors.textTertiary },
  changeNumberRow: { alignItems: 'center' },
  devHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.infoLight,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginTop: spacing.lg,
  },
  devHintText: { ...typography.caption, color: colors.info, flex: 1 },
});
