import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { colors, spacing, typography } from '@theme/index';
import { PrimaryButton, SelectField, TextField } from '@components/index';
import { merchantApi } from '@api/index';
import { digitsOnly, isValidPincode } from '@utils/validators';
import type { BusinessInfoStepData } from '@models/kyc';
import { MCC_OPTIONS } from '../mccOptions';
import { businessInfoSchema, type BusinessInfoFormValues } from '../schemas';

export interface BusinessInfoStepProps {
  initial?: BusinessInfoStepData | undefined;
  onSubmit: (data: BusinessInfoStepData) => void;
  isSubmitting: boolean;
}

/**
 * Section 6.4 Step 1 — Business info.
 * Fields: business name, category (MCC dropdown), address, pincode.
 */
export function BusinessInfoStep({ initial, onSubmit, isSubmitting }: BusinessInfoStepProps) {
  const { t } = useTranslation();
  const [lookupState, setLookupState] = useState<'idle' | 'loading' | 'done'>('idle');

  const { control, handleSubmit, formState, setValue, watch } = useForm<BusinessInfoFormValues>({
    resolver: zodResolver(businessInfoSchema),
    mode: 'onSubmit',
    defaultValues: {
      businessName: initial?.businessName ?? '',
      category: initial?.category ?? '',
      line1: initial?.address.line1 ?? '',
      pincode: initial?.address.pincode ?? '',
      city: initial?.address.city ?? '',
      state: initial?.address.state ?? '',
    },
  });

  const pincode = watch('pincode');

  /**
   * Autofills city and state from the PIN code. This is a deliberate UX choice:
   * typing a city and picking from 36 states is the heaviest part of this form,
   * and the PIN code already determines both. Fields stay editable so a wrong
   * lookup can be corrected.
   */
  useEffect(() => {
    if (!isValidPincode(pincode)) {
      setLookupState('idle');
      return;
    }

    let cancelled = false;
    setLookupState('loading');

    void merchantApi
      .lookupPincode(pincode)
      .then((area) => {
        if (cancelled) return;
        // Do not clobber a value the merchant typed themselves.
        if (!watch('city')) setValue('city', area.city, { shouldValidate: false });
        if (!watch('state')) setValue('state', area.state, { shouldValidate: false });
        setLookupState('done');
      })
      .catch(() => {
        // Unknown PIN code is not an error — the merchant simply fills it in.
        if (!cancelled) setLookupState('idle');
      });

    return () => {
      cancelled = true;
    };
  }, [pincode, setValue, watch]);

  const submit = (values: BusinessInfoFormValues) => {
    onSubmit({
      businessName: values.businessName.trim(),
      category: values.category,
      address: {
        line1: values.line1.trim(),
        city: values.city.trim(),
        state: values.state.trim(),
        pincode: values.pincode,
      },
    });
  };

  const err = (key: keyof BusinessInfoFormValues): string | undefined => {
    const message = formState.errors[key]?.message;
    return message ? t(message) : undefined;
  };

  return (
    <View>
      <Text style={styles.title}>{t('kyc.business.title')}</Text>
      <Text style={styles.subtitle}>{t('kyc.business.subtitle')}</Text>

      <Controller
        control={control}
        name="businessName"
        render={({ field: { value, onChange, onBlur } }) => (
          <TextField
            label={t('kyc.business.name')}
            placeholder={t('kyc.business.namePlaceholder')}
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            error={err('businessName')}
            autoCapitalize="words"
            editable={!isSubmitting}
            testID="kyc-business-name"
          />
        )}
      />

      <Controller
        control={control}
        name="category"
        render={({ field: { value, onChange } }) => (
          <SelectField
            label={t('kyc.business.category')}
            placeholder={t('kyc.business.categoryPlaceholder')}
            sheetTitle={t('kyc.business.categorySheetTitle')}
            value={value}
            options={MCC_OPTIONS.map((option) => ({ value: option.code, label: t(option.labelKey) }))}
            onChange={onChange}
            error={err('category')}
            testID="kyc-business-category"
          />
        )}
      />

      <Controller
        control={control}
        name="line1"
        render={({ field: { value, onChange, onBlur } }) => (
          <TextField
            label={t('kyc.business.addressLine1')}
            placeholder={t('kyc.business.addressPlaceholder')}
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            error={err('line1')}
            multiline
            editable={!isSubmitting}
            testID="kyc-business-address"
          />
        )}
      />

      <Controller
        control={control}
        name="pincode"
        render={({ field: { value, onChange, onBlur } }) => (
          <TextField
            label={t('kyc.business.pincode')}
            placeholder={t('kyc.business.pincodePlaceholder')}
            value={value}
            onChangeText={(text) => onChange(digitsOnly(text).slice(0, 6))}
            onBlur={onBlur}
            error={err('pincode')}
            helper={lookupState === 'loading' ? t('kyc.business.pincodeLookup') : undefined}
            keyboardType="number-pad"
            inputMode="numeric"
            maxLength={6}
            status={lookupState === 'done' ? 'valid' : 'idle'}
            editable={!isSubmitting}
            testID="kyc-business-pincode"
          />
        )}
      />

      <View style={styles.row}>
        <Controller
          control={control}
          name="city"
          render={({ field: { value, onChange, onBlur } }) => (
            <TextField
              label={t('kyc.business.city')}
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              error={err('city')}
              autoCapitalize="words"
              editable={!isSubmitting}
              containerStyle={styles.rowItem}
              testID="kyc-business-city"
            />
          )}
        />
        <Controller
          control={control}
          name="state"
          render={({ field: { value, onChange, onBlur } }) => (
            <TextField
              label={t('kyc.business.state')}
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              error={err('state')}
              autoCapitalize="words"
              editable={!isSubmitting}
              containerStyle={styles.rowItem}
              testID="kyc-business-state"
            />
          )}
        />
      </View>

      <PrimaryButton
        label={t('common.continue')}
        onPress={handleSubmit(submit)}
        loading={isSubmitting}
        size="lg"
        fullWidth
        style={styles.cta}
        testID="kyc-business-continue"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.title, color: colors.text },
  subtitle: { ...typography.small, color: colors.textSecondary, marginTop: spacing.xxs, marginBottom: spacing.lg },
  row: { flexDirection: 'row', gap: spacing.sm },
  rowItem: { flex: 1 },
  cta: { marginTop: spacing.sm },
});
