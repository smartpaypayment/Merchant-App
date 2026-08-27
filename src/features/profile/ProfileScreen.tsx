import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useMutation } from '@tanstack/react-query';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, radius, spacing, typography, MIN_TOUCH_TARGET } from '@theme/index';
import {
  KycStatusBadge,
  PrimaryButton,
  ReauthSheet,
  Screen,
  SecondaryButton,
  SelectField,
  TextField,
} from '@components/index';
import { merchantApi } from '@api/index';
import { ApiError } from '@api/errors';
import { useAuthStore } from '@store/authStore';
import { useNetworkStatus } from '@hooks/useNetworkStatus';
import { digitsOnly, formatMobileForDisplay, isValidIfsc, toUpperAlnum } from '@utils/validators';
import { MCC_OPTIONS } from '@features/onboarding/mccOptions';
import { ScreenHeader } from '@features/collect/ScreenHeader';
import {
  bankAccountSchema,
  businessInfoSchema,
  type BankAccountFormValues,
  type BusinessInfoFormValues,
} from '@features/onboarding/schemas';

type Mode = 'view' | 'editBusiness' | 'editBank';

/**
 * Section 6.14 Profile & Business Settings.
 *
 * View/edit business info, KYC status, VPA, and the settlement bank account.
 *
 * The bank account is treated as a different class of change from the rest.
 * Section 6.14 calls for MFA on it, and the reason is concrete: redirecting the
 * settlement account redirects every future rupee. So it sits behind `ReauthSheet`
 * and re-runs the penny-drop, while ordinary business details save directly.
 *
 * PAN and mobile are read-only here. PAN is bound to the KYC record and the mobile
 * is the login identity — changing either is a support-assisted flow, not a form
 * field, and offering an editable box that silently fails would be worse.
 */
export function ProfileScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const { isOnline } = useNetworkStatus();

  const merchant = useAuthStore((s) => s.merchant);
  const setMerchant = useAuthStore((s) => s.setMerchant);

  const [mode, setMode] = useState<Mode>('view');
  const [reauthVisible, setReauthVisible] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  /** Held until re-auth succeeds, then submitted. */
  const [pendingBank, setPendingBank] = useState<BankAccountFormValues | null>(null);

  const categoryLabel =
    MCC_OPTIONS.find((option) => option.code === merchant?.category)?.labelKey ?? null;

  /* ------------------------------- mutations ------------------------------- */

  const saveBusiness = useMutation({
    mutationFn: (values: BusinessInfoFormValues) =>
      merchantApi.updateProfile({
        businessName: values.businessName.trim(),
        category: values.category,
        address: {
          line1: values.line1.trim(),
          city: values.city.trim(),
          state: values.state.trim(),
          pincode: values.pincode,
        },
      }),
    onSuccess: (updated) => {
      setMerchant(updated);
      setMode('view');
      setError(null);
    },
    onError: (err) => setError(err instanceof ApiError ? err : null),
  });

  const saveBank = useMutation({
    mutationFn: (values: BankAccountFormValues) =>
      merchantApi.updateProfile({
        bankAccount: {
          accountNumber: values.accountNumber,
          ifsc: values.ifsc,
          holderName: values.holderName.trim(),
        },
      }),
    onSuccess: (updated) => {
      setMerchant(updated);
      setMode('view');
      setPendingBank(null);
      setError(null);
      Alert.alert(t('profile.bankSaved'));
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err : null);
      setPendingBank(null);
    },
  });

  const errorBanner = error ? (
    <View style={styles.errorBanner}>
      <Ionicons name="alert-circle" size={18} color={colors.error} />
      <Text style={styles.errorText}>{t(error.i18nKey, { defaultValue: t('errors.unknown') })}</Text>
    </View>
  ) : null;

  if (!merchant) {
    return (
      <Screen testID="profile-screen">
        <ScreenHeader title={t('profile.title')} onBack={() => navigation.goBack()} />
      </Screen>
    );
  }

  /* --------------------------------- edit --------------------------------- */

  if (mode === 'editBusiness') {
    return (
      <Screen scroll keyboardAvoiding testID="profile-screen">
        <ScreenHeader title={t('profile.editTitle')} onBack={() => setMode('view')} />
        <BusinessForm
          merchant={merchant}
          isSubmitting={saveBusiness.isPending}
          onSubmit={(values) => {
            setError(null);
            saveBusiness.mutate(values);
          }}
          errorBanner={errorBanner}
        />
      </Screen>
    );
  }

  if (mode === 'editBank') {
    return (
      <Screen scroll keyboardAvoiding testID="profile-screen">
        <ScreenHeader title={t('profile.bankEditTitle')} onBack={() => setMode('view')} />

        <View style={styles.warningCard}>
          <Ionicons name="warning-outline" size={18} color={colors.warning} />
          <Text style={styles.warningText}>{t('profile.bankChangeWarning')}</Text>
        </View>

        <BankForm
          isSubmitting={saveBank.isPending}
          onSubmit={(values) => {
            setError(null);
            // Hold the values and gate on re-auth — the mutation only runs from
            // the sheet's success callback.
            setPendingBank(values);
            setReauthVisible(true);
          }}
          errorBanner={errorBanner}
        />

        <ReauthSheet
          visible={reauthVisible}
          reason={t('profile.bankReauthReason')}
          onSuccess={() => {
            setReauthVisible(false);
            if (pendingBank) saveBank.mutate(pendingBank);
          }}
          onCancel={() => {
            setReauthVisible(false);
            setPendingBank(null);
          }}
        />
      </Screen>
    );
  }

  /* --------------------------------- view --------------------------------- */

  return (
    <Screen scroll testID="profile-screen">
      <ScreenHeader title={t('profile.title')} onBack={() => navigation.goBack()} />

      {/* Identity + KYC */}
      <View style={styles.heroCard}>
        <View style={styles.heroAvatar}>
          <Ionicons name="storefront" size={26} color={colors.primary} />
        </View>
        <Text style={styles.heroName} numberOfLines={2}>
          {merchant.businessName || t('common.appName')}
        </Text>
        {merchant.vpa ? (
          <Text style={styles.heroVpa} selectable>
            {merchant.vpa}
          </Text>
        ) : null}
        <View style={styles.heroBadge}>
          <KycStatusBadge status={merchant.kycStatus} />
        </View>
        {merchant.kycStatus === 'pending_review' ? (
          <Text style={styles.heroNote}>{t('profile.kycPendingBody')}</Text>
        ) : merchant.kycStatus === 'rejected' ? (
          <Text style={[styles.heroNote, styles.heroNoteError]}>{t('profile.kycRejectedBody')}</Text>
        ) : null}
      </View>

      {errorBanner}

      {/* Business details */}
      <Text style={styles.sectionTitle}>{t('profile.businessTitle')}</Text>
      <View style={styles.card}>
        <Row label={t('profile.nameLabel')} value={merchant.businessName} />
        <Row
          label={t('profile.categoryLabel')}
          value={categoryLabel ? t(categoryLabel) : merchant.category}
          bordered
        />
        <Row
          label={t('profile.addressLabel')}
          value={[merchant.address.line1, merchant.address.city, merchant.address.state, merchant.address.pincode]
            .filter(Boolean)
            .join(', ')}
          bordered
        />
        <Row
          label={t('profile.gstinLabel')}
          value={merchant.gstin || t('profile.gstinEmpty')}
          mono={!!merchant.gstin}
          bordered
        />
      </View>

      <SecondaryButton
        label={t('profile.editCta')}
        onPress={() => {
          setError(null);
          setMode('editBusiness');
        }}
        disabled={!isOnline}
        iconLeft="create-outline"
        fullWidth
        style={styles.cta}
        testID="profile-edit-business"
      />

      {/* Identity (read-only) */}
      <Text style={styles.sectionTitle}>{t('profile.kycTitle')}</Text>
      <View style={styles.card}>
        <Row label={t('profile.panLabel')} value={merchant.pan ?? '—'} mono />
        <Row
          label={t('profile.mobileLabel')}
          value={formatMobileForDisplay(merchant.mobile)}
          bordered
        />
      </View>
      <Text style={styles.readOnlyNote}>{t('profile.readOnlyNote')}</Text>

      {/* Settlement account */}
      <Text style={styles.sectionTitle}>{t('profile.bankTitle')}</Text>
      <View style={styles.card}>
        <Row label={t('profile.bankAccountLabel')} value={merchant.bankAccount.accountNumberMasked || '—'} mono />
        <Row label={t('profile.bankIfscLabel')} value={merchant.bankAccount.ifsc || '—'} mono bordered />
        <Row label={t('profile.bankHolderLabel')} value={merchant.bankAccount.holderName || '—'} bordered />
      </View>

      <SecondaryButton
        label={t('profile.bankChangeCta')}
        onPress={() => {
          setError(null);
          setMode('editBank');
        }}
        disabled={!isOnline}
        iconLeft="lock-closed-outline"
        fullWidth
        style={styles.cta}
        testID="profile-change-bank"
      />

      {!isOnline ? <Text style={styles.offlineNote}>{t('profile.offlineNote')}</Text> : null}
    </Screen>
  );
}

/* -------------------------------------------------------------------------- */
/* Forms                                                                      */
/* -------------------------------------------------------------------------- */

function BusinessForm({
  merchant,
  isSubmitting,
  onSubmit,
  errorBanner,
}: {
  merchant: NonNullable<ReturnType<typeof useAuthStore.getState>['merchant']>;
  isSubmitting: boolean;
  onSubmit: (values: BusinessInfoFormValues) => void;
  errorBanner: React.ReactNode;
}) {
  const { t } = useTranslation();

  // Reuses the KYC step-1 schema: the same fields with the same rules, so a
  // second copy would only be a chance for the two to disagree.
  const { control, handleSubmit, formState } = useForm<BusinessInfoFormValues>({
    resolver: zodResolver(businessInfoSchema),
    mode: 'onSubmit',
    defaultValues: {
      businessName: merchant.businessName,
      category: merchant.category,
      line1: merchant.address.line1,
      pincode: merchant.address.pincode,
      city: merchant.address.city,
      state: merchant.address.state,
    },
  });

  const err = (key: keyof BusinessInfoFormValues): string | undefined => {
    const message = formState.errors[key]?.message;
    return message ? t(message) : undefined;
  };

  return (
    <View>
      <Controller
        control={control}
        name="businessName"
        render={({ field: { value, onChange, onBlur } }) => (
          <TextField
            label={t('kyc.business.name')}
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            error={err('businessName')}
            autoCapitalize="words"
            editable={!isSubmitting}
            testID="profile-name-input"
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
          />
        )}
      />

      <Controller
        control={control}
        name="line1"
        render={({ field: { value, onChange, onBlur } }) => (
          <TextField
            label={t('kyc.business.addressLine1')}
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            error={err('line1')}
            multiline
            editable={!isSubmitting}
          />
        )}
      />

      <Controller
        control={control}
        name="pincode"
        render={({ field: { value, onChange, onBlur } }) => (
          <TextField
            label={t('kyc.business.pincode')}
            value={value}
            onChangeText={(text) => onChange(digitsOnly(text).slice(0, 6))}
            onBlur={onBlur}
            error={err('pincode')}
            keyboardType="number-pad"
            maxLength={6}
            editable={!isSubmitting}
          />
        )}
      />

      <View style={styles.formRow}>
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
              containerStyle={styles.formRowItem}
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
              containerStyle={styles.formRowItem}
            />
          )}
        />
      </View>

      {errorBanner}

      <PrimaryButton
        label={t('profile.saveCta')}
        onPress={handleSubmit(onSubmit)}
        loading={isSubmitting}
        size="lg"
        fullWidth
        style={styles.cta}
        testID="profile-save-business"
      />
    </View>
  );
}

function BankForm({
  isSubmitting,
  onSubmit,
  errorBanner,
}: {
  isSubmitting: boolean;
  onSubmit: (values: BankAccountFormValues) => void;
  errorBanner: React.ReactNode;
}) {
  const { t } = useTranslation();

  // Same schema as KYC step 3, including the re-entry confirmation: a mistyped
  // account number here would send every future settlement to a stranger.
  const { control, handleSubmit, formState } = useForm<BankAccountFormValues>({
    resolver: zodResolver(bankAccountSchema),
    mode: 'onSubmit',
    defaultValues: { accountNumber: '', confirmAccountNumber: '', ifsc: '', holderName: '' },
  });

  const err = (key: keyof BankAccountFormValues): string | undefined => {
    const message = formState.errors[key]?.message;
    return message ? t(message) : undefined;
  };

  return (
    <View>
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
            maxLength={18}
            editable={!isSubmitting}
            testID="profile-bank-account"
          />
        )}
      />

      <Controller
        control={control}
        name="confirmAccountNumber"
        render={({ field: { value, onChange, onBlur } }) => (
          <TextField
            label={t('kyc.bank.confirmAccountNumber')}
            value={value}
            onChangeText={(text) => onChange(digitsOnly(text).slice(0, 18))}
            onBlur={onBlur}
            error={err('confirmAccountNumber')}
            keyboardType="number-pad"
            maxLength={18}
            contextMenuHidden
            editable={!isSubmitting}
            testID="profile-bank-account-confirm"
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
            testID="profile-bank-ifsc"
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
            testID="profile-bank-holder"
          />
        )}
      />

      {isSubmitting ? (
        <View style={styles.verifyingCard}>
          <Text style={styles.verifyingText}>{t('profile.bankVerifying')}</Text>
        </View>
      ) : null}

      {errorBanner}

      <PrimaryButton
        label={t('profile.bankSubmitCta')}
        onPress={handleSubmit(onSubmit)}
        loading={isSubmitting}
        iconLeft="lock-closed-outline"
        size="lg"
        fullWidth
        style={styles.cta}
        testID="profile-save-bank"
      />
    </View>
  );
}

function Row({
  label,
  value,
  mono = false,
  bordered = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
  bordered?: boolean;
}) {
  return (
    <View style={[styles.row, bordered && styles.rowBordered]}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, mono && styles.rowValueMono]} numberOfLines={3} selectable>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  heroCard: {
    alignItems: 'center',
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  heroAvatar: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroName: { ...typography.title, color: colors.text, marginTop: spacing.sm, textAlign: 'center' },
  heroVpa: { ...typography.caption, color: colors.primary, marginTop: 2 },
  heroBadge: { marginTop: spacing.sm },
  heroNote: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  heroNoteError: { color: colors.error },
  sectionTitle: {
    ...typography.captionMedium,
    color: colors.textSecondary,
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: MIN_TOUCH_TARGET,
  },
  rowBordered: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  rowLabel: { ...typography.small, color: colors.textSecondary, flexShrink: 0 },
  rowValue: { ...typography.smallMedium, color: colors.text, flex: 1, textAlign: 'right' },
  rowValueMono: { fontVariant: ['tabular-nums'], fontSize: 13 },
  cta: { marginTop: spacing.md },
  readOnlyNote: { ...typography.caption, color: colors.textTertiary, marginTop: spacing.xs },
  offlineNote: {
    ...typography.caption,
    color: colors.warning,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  warningCard: {
    flexDirection: 'row',
    gap: spacing.xs,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.warningLight,
    marginBottom: spacing.md,
  },
  warningText: { ...typography.caption, color: colors.warning, flex: 1 },
  verifyingCard: {
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.infoLight,
    marginBottom: spacing.sm,
  },
  verifyingText: { ...typography.small, color: colors.info },
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
  formRow: { flexDirection: 'row', gap: spacing.sm },
  formRowItem: { flex: 1 },
});
