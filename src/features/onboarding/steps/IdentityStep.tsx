import { StyleSheet, Text, View } from 'react-native';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, radius, spacing, typography } from '@theme/index';
import { PrimaryButton, TextField } from '@components/index';
import { isValidPan, toUpperAlnum } from '@utils/validators';
import type { IdentityStepData } from '@models/kyc';
import { identitySchema, type IdentityFormValues } from '../schemas';
import { useSensitiveScreen } from '@hooks/useSensitiveScreen';

export interface IdentityStepProps {
  initial?: IdentityStepData | undefined;
  onSubmit: (data: IdentityStepData) => void;
  isSubmitting: boolean;
}

/**
 * Section 6.4 Step 2 — Identity.
 * Fields: PAN (required), GSTIN (optional).
 *
 * Both inputs force-uppercase as the merchant types: PAN and GSTIN are
 * case-insensitive on the card but the regexes and the wire format require
 * uppercase, and rejecting "abcde1234f" as invalid would be indefensible.
 */
export function IdentityStep({ initial, onSubmit, isSubmitting }: IdentityStepProps) {
  // PAN on screen (Section 12).
  useSensitiveScreen();

  const { t } = useTranslation();

  const { control, handleSubmit, formState, watch } = useForm<IdentityFormValues>({
    resolver: zodResolver(identitySchema),
    mode: 'onSubmit',
    defaultValues: { pan: initial?.pan ?? '', gstin: initial?.gstin ?? '' },
  });

  const pan = watch('pan');

  const submit = (values: IdentityFormValues) => {
    onSubmit({
      pan: values.pan,
      // Omit rather than send an empty string, so the field stays absent on the
      // merchant record instead of being stored as "".
      ...(values.gstin ? { gstin: values.gstin } : {}),
    });
  };

  const err = (key: keyof IdentityFormValues): string | undefined => {
    const message = formState.errors[key]?.message;
    return message ? t(message) : undefined;
  };

  return (
    <View>
      <Text style={styles.title}>{t('kyc.identity.title')}</Text>
      <Text style={styles.subtitle}>{t('kyc.identity.subtitle')}</Text>

      <Controller
        control={control}
        name="pan"
        render={({ field: { value, onChange, onBlur } }) => (
          <TextField
            label={t('kyc.identity.pan')}
            placeholder={t('kyc.identity.panPlaceholder')}
            helper={t('kyc.identity.panHelp')}
            value={value}
            onChangeText={(text) => onChange(toUpperAlnum(text).slice(0, 10))}
            onBlur={onBlur}
            error={err('pan')}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={10}
            editable={!isSubmitting}
            status={isValidPan(value) ? 'valid' : 'idle'}
            sensitive
            testID="kyc-identity-pan"
          />
        )}
      />

      <Controller
        control={control}
        name="gstin"
        render={({ field: { value, onChange, onBlur } }) => (
          <TextField
            label={t('kyc.identity.gstin')}
            optionalLabel={t('common.optional')}
            placeholder={t('kyc.identity.gstinPlaceholder')}
            helper={t('kyc.identity.gstinHelp')}
            value={value}
            onChangeText={(text) => onChange(toUpperAlnum(text).slice(0, 15))}
            onBlur={onBlur}
            error={err('gstin')}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={15}
            editable={!isSubmitting}
            testID="kyc-identity-gstin"
          />
        )}
      />

      <View style={styles.noteCard}>
        <Ionicons name="shield-checkmark-outline" size={18} color={colors.info} />
        <Text style={styles.noteText}>{t('kyc.aadhaar.privacyNote')}</Text>
      </View>

      <PrimaryButton
        label={t('common.continue')}
        onPress={handleSubmit(submit)}
        loading={isSubmitting}
        disabled={!pan}
        size="lg"
        fullWidth
        style={styles.cta}
        testID="kyc-identity-continue"
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
    backgroundColor: colors.infoLight,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginBottom: spacing.md,
  },
  noteText: { ...typography.caption, color: colors.info, flex: 1 },
  cta: { marginTop: spacing.xs },
});
