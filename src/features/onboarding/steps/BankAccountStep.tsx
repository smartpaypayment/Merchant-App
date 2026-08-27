import { StyleSheet, Text, View } from 'react-native';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, radius, spacing, typography } from '@theme/index';
import { PrimaryButton, TextField } from '@components/index';
import { digitsOnly, isValidIfsc, toUpperAlnum } from '@utils/validators';
import type { BankAccountStepData } from '@models/kyc';
import { bankAccountSchema, type BankAccountFormValues } from '../schemas';
import { useSensitiveScreen } from '@hooks/useSensitiveScreen';

export interface BankAccountStepProps {
  initial?: BankAccountStepData | undefined;
  onSubmit: (data: BankAccountStepData) => void;
  isSubmitting: boolean;
}

/**
 * Section 6.4 Step 3 — Bank account.
 * Fields: account no., IFSC, holder name. Verified by penny-drop.
 *
 * This is the step that unlocks payments under progressive KYC, which is why the
 * unlock note is shown here rather than only on the success screen: it tells the
 * merchant the payoff for entering their most sensitive data.
 */
export function BankAccountStep({ initial, onSubmit, isSubmitting }: BankAccountStepProps) {
  // Full account number on screen (Section 12).
  useSensitiveScreen();

  const { t } = useTranslation();

  const { control, handleSubmit, formState } = useForm<BankAccountFormValues>({
    resolver: zodResolver(bankAccountSchema),
    mode: 'onSubmit',
    defaultValues: {
      accountNumber: initial?.accountNumber ?? '',
      confirmAccountNumber: initial?.accountNumber ?? '',
      ifsc: initial?.ifsc ?? '',
      holderName: initial?.holderName ?? '',
    },
  });

  const submit = (values: BankAccountFormValues) => {
    onSubmit({
      accountNumber: values.accountNumber,
      ifsc: values.ifsc,
      holderName: values.holderName.trim(),
    });
  };

  const err = (key: keyof BankAccountFormValues): string | undefined => {
    const message = formState.errors[key]?.message;
    return message ? t(message) : undefined;
  };

  return (
    <View>
      <Text style={styles.title}>{t('kyc.bank.title')}</Text>
      <Text style={styles.subtitle}>{t('kyc.bank.subtitle')}</Text>

      <Controller
        control={control}
        name="accountNumber"
        render={({ field: { value, onChange, onBlur } }) => (
          <TextField
            label={t('kyc.bank.accountNumber')}
            placeholder={t('kyc.bank.accountNumberPlaceholder')}
            value={value}
            onChangeText={(text) => onChange(digitsOnly(text).slice(0, 18))}
            onBlur={onBlur}
            error={err('accountNumber')}
            keyboardType="number-pad"
            inputMode="numeric"
            maxLength={18}
            editable={!isSubmitting}
            sensitive
            testID="kyc-bank-account"
          />
        )}
      />

      <Controller
        control={control}
        name="confirmAccountNumber"
        render={({ field: { value, onChange, onBlur } }) => (
          <TextField
            label={t('kyc.bank.confirmAccountNumber')}
            placeholder={t('kyc.bank.accountNumberPlaceholder')}
            value={value}
            onChangeText={(text) => onChange(digitsOnly(text).slice(0, 18))}
            onBlur={onBlur}
            error={err('confirmAccountNumber')}
            keyboardType="number-pad"
            inputMode="numeric"
            maxLength={18}
            // Prevents the "paste the same wrong number twice" failure mode.
            contextMenuHidden
            editable={!isSubmitting}
            sensitive
            testID="kyc-bank-account-confirm"
          />
        )}
      />

      <Controller
        control={control}
        name="ifsc"
        render={({ field: { value, onChange, onBlur } }) => (
          <TextField
            label={t('kyc.bank.ifsc')}
            placeholder={t('kyc.bank.ifscPlaceholder')}
            value={value}
            onChangeText={(text) => onChange(toUpperAlnum(text).slice(0, 11))}
            onBlur={onBlur}
            error={err('ifsc')}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={11}
            status={isValidIfsc(value) ? 'valid' : 'idle'}
            editable={!isSubmitting}
            testID="kyc-bank-ifsc"
          />
        )}
      />

      <Controller
        control={control}
        name="holderName"
        render={({ field: { value, onChange, onBlur } }) => (
          <TextField
            label={t('kyc.bank.holderName')}
            placeholder={t('kyc.bank.holderNamePlaceholder')}
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            error={err('holderName')}
            autoCapitalize="words"
            editable={!isSubmitting}
            testID="kyc-bank-holder"
          />
        )}
      />

      <View style={styles.noteCard}>
        <Ionicons name="flash-outline" size={18} color={colors.success} />
        <Text style={styles.noteText}>{t('kyc.bank.unlockNote')}</Text>
      </View>

      {isSubmitting ? (
        <View style={styles.pennyDropCard}>
          <Text style={styles.pennyDropTitle}>{t('kyc.bank.verifying')}</Text>
          <Text style={styles.pennyDropBody}>{t('kyc.bank.verifyingBody')}</Text>
        </View>
      ) : null}

      <PrimaryButton
        label={t('kyc.bank.verifyCta')}
        onPress={handleSubmit(submit)}
        loading={isSubmitting}
        size="lg"
        fullWidth
        style={styles.cta}
        testID="kyc-bank-continue"
      />
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
    backgroundColor: colors.successLight,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginBottom: spacing.md,
  },
  noteText: { ...typography.caption, color: colors.success, flex: 1 },
  pennyDropCard: {
    backgroundColor: colors.infoLight,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginBottom: spacing.md,
  },
  pennyDropTitle: { ...typography.smallMedium, color: colors.info },
  pennyDropBody: { ...typography.caption, color: colors.info, marginTop: 2 },
  cta: { marginTop: spacing.xs },
});
