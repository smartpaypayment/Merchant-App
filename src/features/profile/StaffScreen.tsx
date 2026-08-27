import { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, Modal, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import Ionicons from '@expo/vector-icons/Ionicons';
import { z } from 'zod';
import { colors, radius, spacing, typography, MIN_TOUCH_TARGET } from '@theme/index';
import {
  EmptyState,
  ErrorState,
  ListSkeleton,
  PrimaryButton,
  Screen,
  TextField,
} from '@components/index';
import { miscApi } from '@api/index';
import { ApiError } from '@api/errors';
import { queryKeys } from '@app/providers/queryClient';
import { useNetworkStatus } from '@hooks/useNetworkStatus';
import { digitsOnly, formatMobileForDisplay, MOBILE_REGEX } from '@utils/validators';
import { ScreenHeader } from '@features/collect/ScreenHeader';
import type { Staff } from '@models/index';

type StaffRole = Staff['role'];

const ROLES: readonly StaffRole[] = ['cashier', 'manager'] as const;

/** Messages are i18n keys, resolved by the form — same convention as the KYC schemas. */
const staffSchema = z.object({
  name: z.string().trim().min(1, 'staff.nameRequired'),
  mobile: z.string().min(1, 'staff.mobileRequired').regex(MOBILE_REGEX, 'staff.mobileInvalid'),
  role: z.enum(['manager', 'cashier']),
});
type StaffFormValues = z.infer<typeof staffSchema>;

/**
 * Section 6.15 Staff Management.
 *
 * Lists the people who can collect on the merchant's behalf, and adds, re-roles
 * and removes them. Handles loading, empty, error and offline states.
 *
 * ## Rows are not tappable
 *
 * There is no staff-detail screen — a member is a name, a mobile and a role, all
 * three of which fit in the row. So the row is a plain `View` carrying two
 * explicit actions rather than a pressable row with pressable children, which
 * would nest interactive controls (invalid DOM on RN Web, undescribable to a
 * screen reader) and is caught by `noNestedPressables.test.ts`.
 *
 * ## Writes are blocked offline rather than queued
 *
 * Staff changes are authorisation changes: queuing "remove the cashier" for later
 * delivery would leave a dismissed employee able to collect money until the phone
 * next found signal. The list itself still renders from cache offline, so the
 * merchant can at least see who has access.
 */
export function StaffScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const { isOnline } = useNetworkStatus();

  const [addVisible, setAddVisible] = useState(false);
  const [roleTarget, setRoleTarget] = useState<Staff | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  /** Write failures surface here; read failures go to `ErrorState`. */
  const [writeError, setWriteError] = useState<ApiError | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: queryKeys.staff,
    queryFn: miscApi.listStaff,
  });

  const staff = useMemo(() => data ?? [], [data]);

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.staff });
  }, [queryClient]);

  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await refetch();
    } finally {
      setIsRefreshing(false);
    }
  }, [refetch]);

  /* ------------------------------- mutations ------------------------------- */

  const addStaff = useMutation({
    mutationFn: (values: StaffFormValues) =>
      miscApi.addStaff({ name: values.name.trim(), mobile: values.mobile, role: values.role }),
    onSuccess: (member) => {
      invalidate();
      setAddVisible(false);
      setWriteError(null);
      Alert.alert(t('staff.added', { name: member.name }));
    },
  });

  const updateRole = useMutation({
    mutationFn: ({ id, role }: { id: string; role: StaffRole }) => miscApi.updateStaff(id, { role }),
    onSuccess: () => {
      invalidate();
      setRoleTarget(null);
      setWriteError(null);
      Alert.alert(t('staff.roleSaved'));
    },
    onError: (err) => setWriteError(err instanceof ApiError ? err : null),
  });

  const removeStaff = useMutation({
    mutationFn: (member: Staff) => miscApi.removeStaff(member.id),
    onSuccess: (_result, member) => {
      invalidate();
      setWriteError(null);
      Alert.alert(t('staff.removed', { name: member.name }));
    },
    onError: (err) => setWriteError(err instanceof ApiError ? err : null),
  });

  const confirmRemove = useCallback(
    (member: Staff) => {
      Alert.alert(
        t('staff.removeConfirmTitle', { name: member.name }),
        t('staff.removeConfirmBody'),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('staff.removeCta'),
            style: 'destructive',
            onPress: () => removeStaff.mutate(member),
          },
        ],
      );
    },
    [removeStaff, t],
  );

  /* -------------------------------- render -------------------------------- */

  const showSkeleton = isLoading && staff.length === 0;
  const showError = isError && staff.length === 0;
  const showEmpty = !isLoading && !isError && staff.length === 0;
  const isMutating = removeStaff.isPending || updateRole.isPending;

  const renderRow = useCallback(
    ({ item }: { item: Staff }) => (
      <StaffRow
        member={item}
        canWrite={isOnline && !isMutating}
        onEditRole={setRoleTarget}
        onRemove={confirmRemove}
      />
    ),
    [confirmRemove, isMutating, isOnline],
  );

  return (
    <Screen testID="staff-screen">
      <ScreenHeader title={t('staff.title')} onBack={() => navigation.goBack()} />

      <FlatList
        data={staff}
        keyExtractor={(item) => item.id}
        renderItem={renderRow}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
        ListHeaderComponent={
          <View>
            <Text style={styles.subtitle}>{t('staff.subtitle')}</Text>

            {staff.length > 0 ? (
              <Text style={styles.count}>{t('staff.countLabel', { count: staff.length })}</Text>
            ) : null}

            {writeError ? (
              <View style={styles.errorBanner}>
                <Ionicons name="alert-circle" size={18} color={colors.error} />
                <Text style={styles.errorBannerText}>
                  {t(writeError.i18nKey, { defaultValue: t('errors.unknown') })}
                </Text>
              </View>
            ) : null}

            {showSkeleton ? <ListSkeleton count={3} /> : null}

            {showError ? (
              <ErrorState error={error} title={t('staff.errorTitle')} onRetry={() => void refetch()} />
            ) : null}

            {showEmpty ? (
              <EmptyState
                icon="people-outline"
                title={t('staff.emptyTitle')}
                body={t('staff.emptyBody')}
                {...(isOnline
                  ? { ctaLabel: t('staff.addCta'), onCtaPress: () => setAddVisible(true) }
                  : {})}
              />
            ) : null}
          </View>
        }
        ListFooterComponent={
          <View style={styles.footer}>
            {staff.length > 0 ? (
              <PrimaryButton
                label={t('staff.addCta')}
                onPress={() => {
                  setWriteError(null);
                  setAddVisible(true);
                }}
                disabled={!isOnline}
                iconLeft="person-add-outline"
                fullWidth
                testID="staff-add"
              />
            ) : null}

            {!isOnline ? <Text style={styles.offlineNote}>{t('staff.offlineNote')}</Text> : null}
          </View>
        }
        contentContainerStyle={styles.listContent}
      />

      <AddStaffSheet
        visible={addVisible}
        isSubmitting={addStaff.isPending}
        error={addStaff.error}
        onSubmit={(values) => addStaff.mutate(values)}
        onClose={() => {
          addStaff.reset();
          setAddVisible(false);
        }}
      />

      <RoleSheet
        member={roleTarget}
        isSubmitting={updateRole.isPending}
        onSelect={(role) => {
          if (roleTarget && roleTarget.role !== role) {
            updateRole.mutate({ id: roleTarget.id, role });
          } else {
            setRoleTarget(null);
          }
        }}
        onClose={() => setRoleTarget(null)}
      />
    </Screen>
  );
}

/* -------------------------------------------------------------------------- */
/* Row                                                                        */
/* -------------------------------------------------------------------------- */

function StaffRow({
  member,
  canWrite,
  onEditRole,
  onRemove,
}: {
  member: Staff;
  canWrite: boolean;
  onEditRole: (member: Staff) => void;
  onRemove: (member: Staff) => void;
}) {
  const { t } = useTranslation();

  return (
    <View style={styles.row}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{initial(member.name)}</Text>
      </View>

      <View style={styles.rowText}>
        <Text style={styles.rowName} numberOfLines={1}>
          {member.name}
        </Text>
        <Text style={styles.rowMobile}>{formatMobileForDisplay(member.mobile)}</Text>
        <View style={styles.roleBadge}>
          <Text style={styles.roleBadgeText}>{t(`staff.roles.${member.role}`)}</Text>
        </View>
      </View>

      <View style={styles.rowActions}>
        <Pressable
          onPress={() => onEditRole(member)}
          disabled={!canWrite}
          accessibilityRole="button"
          accessibilityLabel={t('staff.editRoleTitle', { name: member.name })}
          hitSlop={8}
          style={({ pressed }) => [
            styles.iconButton,
            pressed && styles.pressed,
            !canWrite && styles.iconButtonDisabled,
          ]}
          testID={`staff-edit-${member.id}`}
        >
          <Ionicons
            name="swap-horizontal-outline"
            size={20}
            color={canWrite ? colors.primary : colors.disabled}
          />
        </Pressable>

        <Pressable
          onPress={() => onRemove(member)}
          disabled={!canWrite}
          accessibilityRole="button"
          accessibilityLabel={t('staff.removeConfirmTitle', { name: member.name })}
          hitSlop={8}
          style={({ pressed }) => [
            styles.iconButton,
            pressed && styles.pressed,
            !canWrite && styles.iconButtonDisabled,
          ]}
          testID={`staff-remove-${member.id}`}
        >
          <Ionicons
            name="trash-outline"
            size={20}
            color={canWrite ? colors.error : colors.disabled}
          />
        </Pressable>
      </View>
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* Add sheet                                                                  */
/* -------------------------------------------------------------------------- */

function AddStaffSheet({
  visible,
  isSubmitting,
  error,
  onSubmit,
  onClose,
}: {
  visible: boolean;
  isSubmitting: boolean;
  error: unknown;
  onSubmit: (values: StaffFormValues) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();

  const { control, handleSubmit, formState, reset } = useForm<StaffFormValues>({
    resolver: zodResolver(staffSchema),
    mode: 'onSubmit',
    defaultValues: { name: '', mobile: '', role: 'cashier' },
  });

  const close = () => {
    reset();
    onClose();
  };

  const fieldError = (key: keyof StaffFormValues): string | undefined => {
    const message = formState.errors[key]?.message;
    return message ? t(message) : undefined;
  };

  /*
   * The server rejects a mobile already on the roster with 409. That belongs on
   * the mobile field, not in a banner: the merchant's next action is to correct
   * that one box. Anything else is a genuine failure and gets the banner.
   */
  const apiError = error instanceof ApiError ? error : null;
  const isDuplicateMobile =
    apiError !== null &&
    (apiError.httpStatus === 409 || apiError.details?.['field'] === 'mobile');

  const mobileError = fieldError('mobile') ?? (isDuplicateMobile ? t('staff.mobileDuplicate') : undefined);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close} accessibilityLabel={t('common.cancel')} />

      <View style={styles.sheet}>
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>{t('staff.addTitle')}</Text>
          <Pressable
            onPress={close}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={t('common.cancel')}
            style={styles.closeButton}
          >
            <Ionicons name="close" size={22} color={colors.textSecondary} />
          </Pressable>
        </View>

        <View style={styles.sheetBody}>
          <Controller
            control={control}
            name="name"
            render={({ field: { value, onChange, onBlur } }) => (
              <TextField
                label={t('staff.nameLabel')}
                placeholder={t('staff.namePlaceholder')}
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={fieldError('name')}
                autoCapitalize="words"
                editable={!isSubmitting}
                testID="staff-name-input"
              />
            )}
          />

          <Controller
            control={control}
            name="mobile"
            render={({ field: { value, onChange, onBlur } }) => (
              <TextField
                label={t('staff.mobileLabel')}
                value={value}
                onChangeText={(text) => onChange(digitsOnly(text).slice(0, 10))}
                onBlur={onBlur}
                error={mobileError}
                keyboardType="phone-pad"
                maxLength={10}
                editable={!isSubmitting}
                testID="staff-mobile-input"
              />
            )}
          />

          <Controller
            control={control}
            name="role"
            render={({ field: { value, onChange } }) => (
              <RolePicker value={value} onChange={onChange} disabled={isSubmitting} />
            )}
          />

          {apiError && !isDuplicateMobile ? (
            <View style={styles.errorBanner}>
              <Ionicons name="alert-circle" size={18} color={colors.error} />
              <Text style={styles.errorBannerText}>
                {t(apiError.i18nKey, { defaultValue: t('errors.unknown') })}
              </Text>
            </View>
          ) : null}

          <PrimaryButton
            label={t('staff.addSubmit')}
            onPress={handleSubmit(onSubmit)}
            loading={isSubmitting}
            size="lg"
            fullWidth
            style={styles.sheetCta}
            testID="staff-add-submit"
          />
        </View>
      </View>
    </Modal>
  );
}

/**
 * Role chooser rendered as two labelled cards rather than a dropdown.
 *
 * The choice decides whether someone can issue refunds, so the consequence has to
 * be readable at the moment of choosing — a collapsed picker showing only
 * "Cashier" hides exactly the information the merchant needs.
 */
function RolePicker({
  value,
  onChange,
  disabled = false,
}: {
  value: StaffRole;
  onChange: (role: StaffRole) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();

  return (
    <View style={styles.rolePicker}>
      <Text style={styles.rolePickerLabel}>{t('staff.roleLabel')}</Text>

      {ROLES.map((role) => {
        const selected = role === value;
        return (
          <Pressable
            key={role}
            onPress={() => onChange(role)}
            disabled={disabled}
            accessibilityRole="radio"
            accessibilityState={{ selected, disabled }}
            accessibilityLabel={`${t(`staff.roles.${role}`)}. ${t(`staff.roleHelp.${role}`)}`}
            style={({ pressed }) => [
              styles.roleCard,
              selected && styles.roleCardSelected,
              pressed && styles.pressed,
            ]}
            testID={`staff-role-${role}`}
          >
            <Ionicons
              name={selected ? 'radio-button-on' : 'radio-button-off'}
              size={20}
              color={selected ? colors.primary : colors.textTertiary}
            />
            <View style={styles.roleCardText}>
              <Text style={[styles.roleCardTitle, selected && styles.roleCardTitleSelected]}>
                {t(`staff.roles.${role}`)}
              </Text>
              <Text style={styles.roleCardBody}>{t(`staff.roleHelp.${role}`)}</Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Role change for an existing member. */
function RoleSheet({
  member,
  isSubmitting,
  onSelect,
  onClose,
}: {
  member: Staff | null;
  isSubmitting: boolean;
  onSelect: (role: StaffRole) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();

  return (
    <Modal
      visible={member !== null}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel={t('common.cancel')} />

      <View style={styles.sheet}>
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle} numberOfLines={2}>
            {member ? t('staff.editRoleTitle', { name: member.name }) : ''}
          </Text>
          <Pressable
            onPress={onClose}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={t('common.cancel')}
            style={styles.closeButton}
          >
            <Ionicons name="close" size={22} color={colors.textSecondary} />
          </Pressable>
        </View>

        <View style={styles.sheetBody}>
          {member ? (
            <RolePicker value={member.role} onChange={onSelect} disabled={isSubmitting} />
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

/** First character of the name, for the avatar. Falls back to a person glyph-free dot. */
function initial(name: string): string {
  const trimmed = name.trim();
  return trimmed.length > 0 ? trimmed.charAt(0).toUpperCase() : '\u2022';
}

const styles = StyleSheet.create({
  listContent: { paddingBottom: spacing.xl },
  subtitle: { ...typography.small, color: colors.textSecondary, marginBottom: spacing.sm },
  count: {
    ...typography.captionMedium,
    color: colors.textTertiary,
    textTransform: 'uppercase',
    marginBottom: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { ...typography.bodyLarge, color: colors.primary },
  rowText: { flex: 1, gap: 2 },
  rowName: { ...typography.bodyMedium, color: colors.text },
  rowMobile: { ...typography.caption, color: colors.textTertiary, fontVariant: ['tabular-nums'] },
  roleBadge: {
    alignSelf: 'flex-start',
    marginTop: spacing.xxs,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceAlt,
  },
  roleBadgeText: { ...typography.caption, color: colors.textSecondary },
  rowActions: { flexDirection: 'row', gap: spacing.xxs },
  iconButton: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
  },
  iconButtonDisabled: { opacity: 0.4 },
  pressed: { opacity: 0.7 },
  footer: { marginTop: spacing.sm },
  offlineNote: {
    ...typography.caption,
    color: colors.warning,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.errorLight,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  errorBannerText: { ...typography.small, color: colors.error, flex: 1 },
  backdrop: { flex: 1, backgroundColor: colors.overlay },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingBottom: spacing.xl,
    maxHeight: '90%',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  sheetTitle: { ...typography.bodyLarge, color: colors.text, flex: 1 },
  closeButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  sheetBody: { padding: spacing.md },
  sheetCta: { marginTop: spacing.sm },
  rolePicker: { marginBottom: spacing.md },
  rolePickerLabel: {
    ...typography.smallMedium,
    color: colors.textSecondary,
    marginBottom: spacing.xxs,
  },
  roleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    marginBottom: spacing.xs,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    minHeight: MIN_TOUCH_TARGET,
  },
  roleCardSelected: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  roleCardText: { flex: 1 },
  roleCardTitle: { ...typography.bodyMedium, color: colors.text },
  roleCardTitleSelected: { color: colors.primary },
  roleCardBody: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
});
