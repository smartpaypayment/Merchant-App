import { useState } from 'react';
import { Keyboard, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, radius, spacing, typography } from '@theme/index';
import { Checkbox, LanguageSelector, PrimaryButton, Screen, TextField } from '@components/index';
import { authApi } from '@api/index';
import { ApiError } from '@api/errors';
import { useAuthStore } from '@store/authStore';
import { digitsOnly, MOBILE_LENGTH } from '@utils/validators';
import type { AuthStackParamList } from '@app/navigation/types';
import { loginSchema, type LoginFormValues } from './schemas';

type Nav = NativeStackNavigationProp<AuthStackParamList, 'Login'>;

/**
 * Section 6.2 Login Screen.
 *
 * UI: logo, mobile input (10-digit, +91 prefix), "Get OTP", T&C consent.
 * States: idle, submitting (button loader), error (invalid number / rate limit).
 *
 * The language picker sits in the header on purpose: this is the first screen a
 * merchant sees, and a Hindi- or Tamil-only user must be able to switch before
 * committing to a flow they cannot read (Section 13).
 */
export function LoginScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<Nav>();
  const setPendingMobile = useAuthStore((s) => s.setPendingMobile);

  /** Request-level failure (as opposed to per-field validation). */
  const [submitError, setSubmitError] = useState<ApiError | null>(null);

  const { control, handleSubmit, formState, watch } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    mode: 'onSubmit',
    defaultValues: { mobile: '', consent: false as unknown as true },
  });

  const mobile = watch('mobile');

  const requestOtp = useMutation({
    mutationFn: (values: LoginFormValues) => authApi.requestOtp({ mobile: values.mobile }),
    onSuccess: (data, values) => {
      setPendingMobile(values.mobile);
      navigation.navigate('OTPVerify', {
        mobile: values.mobile,
        resendAfterSeconds: data.resendAfterSeconds,
      });
    },
    onError: (error) => {
      setSubmitError(error instanceof ApiError ? error : null);
    },
  });

  const onSubmit = (values: LoginFormValues) => {
    Keyboard.dismiss();
    setSubmitError(null);
    requestOtp.mutate(values);
  };

  return (
    <Screen scroll keyboardAvoiding testID="login-screen">
      <View style={styles.header}>
        <LanguageSelector />
      </View>

      <View style={styles.brand}>
        <View style={styles.logoMark}>
          <Text style={styles.logoGlyph} allowFontScaling={false}>
            {'\u20B9'}
          </Text>
        </View>
        <Text style={styles.title}>{t('auth.login.title')}</Text>
        <Text style={styles.subtitle}>{t('auth.login.subtitle')}</Text>
      </View>

      <View style={styles.form}>
        <Controller
          control={control}
          name="mobile"
          render={({ field: { value, onChange, onBlur } }) => (
            <TextField
              label={t('auth.login.mobileLabel')}
              placeholder={t('auth.login.mobilePlaceholder')}
              prefix="+91"
              value={value}
              // Strip non-digits at the source so paste of "+91 98765 43210"
              // or "098765-43210" still yields a clean 10-digit value.
              onChangeText={(text) => onChange(digitsOnly(text).slice(0, MOBILE_LENGTH))}
              onBlur={onBlur}
              error={formState.errors.mobile ? t(formState.errors.mobile.message ?? '') : undefined}
              keyboardType="phone-pad"
              inputMode="numeric"
              maxLength={MOBILE_LENGTH}
              autoComplete="tel"
              textContentType="telephoneNumber"
              returnKeyType="done"
              editable={!requestOtp.isPending}
              status={value.length === MOBILE_LENGTH && !formState.errors.mobile ? 'valid' : 'idle'}
              testID="login-mobile-input"
            />
          )}
        />

        <Controller
          control={control}
          name="consent"
          render={({ field: { value, onChange } }) => (
            <Checkbox
              checked={!!value}
              onChange={onChange}
              label={t('auth.login.consent')}
              error={formState.errors.consent ? t(formState.errors.consent.message ?? '') : undefined}
              disabled={requestOtp.isPending}
              testID="login-consent-checkbox"
            />
          )}
        />

        {submitError ? (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle" size={18} color={colors.error} />
            <Text style={styles.errorText}>
              {t(submitError.i18nKey, { defaultValue: t('errors.unknown') })}
            </Text>
          </View>
        ) : null}

        <PrimaryButton
          label={t('auth.login.getOtp')}
          onPress={handleSubmit(onSubmit)}
          loading={requestOtp.isPending}
          disabled={mobile.length !== MOBILE_LENGTH}
          size="lg"
          fullWidth
          style={styles.cta}
          testID="login-submit-button"
        />

        <View style={styles.secureRow}>
          <Ionicons name="lock-closed" size={14} color={colors.textTertiary} />
          <Text style={styles.secureNote}>{t('auth.login.secureNote')}</Text>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: 'flex-end', paddingTop: spacing.xs },
  brand: { alignItems: 'center', marginTop: spacing.lg, marginBottom: spacing.xl },
  logoMark: {
    width: 72,
    height: 72,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoGlyph: { fontSize: 40, lineHeight: 48, fontWeight: '700', color: colors.textInverse },
  title: { ...typography.heading, color: colors.text, marginTop: spacing.md },
  subtitle: {
    ...typography.small,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xxs,
    maxWidth: 300,
  },
  form: { marginTop: spacing.xs },
  cta: { marginTop: spacing.md },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.errorLight,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginTop: spacing.xs,
  },
  errorText: { ...typography.small, color: colors.error, flex: 1 },
  secureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xxs,
    marginTop: spacing.md,
  },
  secureNote: { ...typography.caption, color: colors.textTertiary },
});
