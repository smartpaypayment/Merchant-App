import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, radius, spacing, typography } from '@theme/index';
import { Checkbox, GhostButton, OTPInput, PrimaryButton, TextField } from '@components/index';
import { merchantApi } from '@api/index';
import { ApiError } from '@api/errors';
import { digitsOnly, OTP_LENGTH } from '@utils/validators';
import { useCountdown } from '@hooks/useCountdown';
import type { AadhaarEkycStepData } from '@models/kyc';
import { aadhaarSchema, type AadhaarFormValues } from '../schemas';
import { useSensitiveScreen } from '@hooks/useSensitiveScreen';

export interface AadhaarStepProps {
  onSubmit: (data: AadhaarEkycStepData) => void;
  /** Section 6.4 progressive KYC: submit for review without finishing eKYC. */
  onSkip: () => void;
  isSubmitting: boolean;
}

/**
 * Section 6.4 Step 4 — Aadhaar eKYC (consent).
 *
 * Two phases in one screen: request an OTP against the Aadhaar-linked mobile,
 * then verify it. Consent is a hard gate — the "Send OTP" button stays disabled
 * until the box is ticked, and the server also rejects an unconsented request, so
 * consent cannot be bypassed by a client-side edit.
 *
 * The Aadhaar number is held in component state only. It is never written to the
 * KYC draft or local storage; only the consent flag and the server-returned last
 * four digits are persisted (Section 12).
 */
export function AadhaarStep({ onSubmit, onSkip, isSubmitting }: AadhaarStepProps) {
  // Aadhaar number on screen (Section 12).
  useSensitiveScreen();

  const { t } = useTranslation();
  const [phase, setPhase] = useState<'enter' | 'otp'>('enter');
  const [transactionId, setTransactionId] = useState<string | null>(null);
  const [otp, setOtp] = useState('');
  const [error, setError] = useState<ApiError | null>(null);
  const resend = useCountdown(0);

  const { control, handleSubmit, formState, watch } = useForm<AadhaarFormValues>({
    resolver: zodResolver(aadhaarSchema),
    mode: 'onSubmit',
    defaultValues: { aadhaarNumber: '', consentGiven: false as unknown as true },
  });

  const consentGiven = watch('consentGiven');
  const aadhaarNumber = watch('aadhaarNumber');

  const sendOtp = useMutation({
    mutationFn: (values: AadhaarFormValues) =>
      merchantApi.requestAadhaarOtp({
        aadhaarNumber: values.aadhaarNumber,
        consentGiven: values.consentGiven,
      }),
    onSuccess: (data) => {
      setTransactionId(data.transactionId);
      setPhase('otp');
      setError(null);
      resend.restart(data.resendAfterSeconds);
    },
    onError: (err) => setError(err instanceof ApiError ? err : null),
  });

  const verify = useMutation({
    mutationFn: (code: string) =>
      merchantApi.verifyAadhaarOtp({ transactionId: transactionId ?? '', otp: code }),
    onSuccess: (data) => {
      onSubmit({
        consentGiven: true,
        aadhaarLast4: data.aadhaarLast4,
        verified: data.verified,
      });
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err : null);
      setOtp('');
    },
  });

  const busy = sendOtp.isPending || verify.isPending || isSubmitting;

  const errorBanner = error ? (
    <View style={styles.errorBanner}>
      <Ionicons name="alert-circle" size={18} color={colors.error} />
      <Text style={styles.errorText}>{t(error.i18nKey, { defaultValue: t('errors.unknown') })}</Text>
    </View>
  ) : null;

  return (
    <View>
      <Text style={styles.title}>{t('kyc.aadhaar.title')}</Text>
      <Text style={styles.subtitle}>{t('kyc.aadhaar.subtitle')}</Text>

      {phase === 'enter' ? (
        <>
          <Controller
            control={control}
            name="aadhaarNumber"
            render={({ field: { value, onChange, onBlur } }) => (
              <TextField
                label={t('kyc.aadhaar.numberLabel')}
                placeholder={t('kyc.aadhaar.numberPlaceholder')}
                value={value}
                onChangeText={(text) => onChange(digitsOnly(text).slice(0, 12))}
                onBlur={onBlur}
                error={formState.errors.aadhaarNumber ? t(formState.errors.aadhaarNumber.message ?? '') : undefined}
                keyboardType="number-pad"
                inputMode="numeric"
                maxLength={12}
                editable={!busy}
                sensitive
                testID="kyc-aadhaar-number"
              />
            )}
          />

          <Controller
            control={control}
            name="consentGiven"
            render={({ field: { value, onChange } }) => (
              <Checkbox
                checked={!!value}
                onChange={onChange}
                label={t('kyc.aadhaar.consent')}
                error={formState.errors.consentGiven ? t(formState.errors.consentGiven.message ?? '') : undefined}
                disabled={busy}
                testID="kyc-aadhaar-consent"
              />
            )}
          />

          <View style={styles.noteCard}>
            <Ionicons name="lock-closed-outline" size={16} color={colors.info} />
            <Text style={styles.noteText}>{t('kyc.aadhaar.privacyNote')}</Text>
          </View>

          {errorBanner}

          <PrimaryButton
            label={t('kyc.aadhaar.sendOtp')}
            onPress={handleSubmit((values) => sendOtp.mutate(values))}
            loading={sendOtp.isPending}
            // Consent is mandatory: no consent, no request.
            disabled={!consentGiven || aadhaarNumber.length !== 12}
            size="lg"
            fullWidth
            style={styles.cta}
            testID="kyc-aadhaar-send-otp"
          />
        </>
      ) : (
        <>
          <Text style={styles.otpLabel}>{t('kyc.aadhaar.otpLabel')}</Text>
          <Text style={styles.otpHint}>{t('kyc.aadhaar.otpSentTo')}</Text>

          <OTPInput
            value={otp}
            onChange={(next) => {
              setOtp(next);
              if (error) setError(null);
            }}
            onComplete={(code) => verify.mutate(code)}
            length={OTP_LENGTH}
            hasError={!!error}
            editable={!busy}
            accessibilityLabel={t('kyc.aadhaar.otpLabel')}
            testID="kyc-aadhaar-otp"
          />

          {errorBanner}

          <PrimaryButton
            label={t('kyc.aadhaar.verifyCta')}
            onPress={() => verify.mutate(otp)}
            loading={verify.isPending || isSubmitting}
            disabled={otp.length !== OTP_LENGTH}
            size="lg"
            fullWidth
            style={styles.cta}
            testID="kyc-aadhaar-verify"
          />

          <View style={styles.resendRow}>
            {resend.isRunning ? (
              <Text style={styles.resendTimer}>
                {t('auth.otp.resendIn', { seconds: resend.secondsLeft })}
              </Text>
            ) : (
              <GhostButton
                label={t('auth.otp.resend')}
                onPress={() => sendOtp.mutate({ aadhaarNumber, consentGiven: true })}
                loading={sendOtp.isPending}
                iconLeft="refresh"
              />
            )}
          </View>
        </>
      )}

      <View style={styles.skipRow}>
        <GhostButton label={t('kyc.aadhaar.skipForNow')} onPress={onSkip} disabled={busy} testID="kyc-aadhaar-skip" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.title, color: colors.text },
  subtitle: { ...typography.small, color: colors.textSecondary, marginTop: spacing.xxs, marginBottom: spacing.lg },
  noteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.infoLight,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginTop: spacing.xs,
  },
  noteText: { ...typography.caption, color: colors.info, flex: 1 },
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
  otpLabel: { ...typography.bodyMedium, color: colors.text },
  otpHint: { ...typography.caption, color: colors.textSecondary, marginTop: 2, marginBottom: spacing.md },
  cta: { marginTop: spacing.lg },
  resendRow: { alignItems: 'center', marginTop: spacing.xs, minHeight: 48, justifyContent: 'center' },
  resendTimer: { ...typography.small, color: colors.textTertiary },
  skipRow: { alignItems: 'center', marginTop: spacing.sm },
});
