import { useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import { colors, radius, spacing, typography, MIN_TOUCH_TARGET } from '@theme/index';
import { addDays, dateParts, endOfDay, startOfDay } from '@utils/date';
import { PrimaryButton, SecondaryButton } from './Button';

/** Preset windows, which cover almost every real query a merchant makes. */
export type DateRangePreset = 'today' | 'yesterday' | 'last7' | 'last30' | 'thisMonth' | 'all' | 'custom';

export interface DateRange {
  preset: DateRangePreset;
  /** Inclusive start. `null` for `all`. */
  from: Date | null;
  /** Inclusive end. `null` for `all`. */
  to: Date | null;
}

export interface DateRangePickerProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
  /** Presets to offer, in order. */
  presets?: readonly DateRangePreset[];
  testID?: string;
}

export const ALL_TIME_RANGE: DateRange = { preset: 'all', from: null, to: null };

/** Resolves a preset to concrete day boundaries. */
export function resolvePreset(preset: Exclude<DateRangePreset, 'custom'>): DateRange {
  const now = new Date();

  switch (preset) {
    case 'today':
      return { preset, from: startOfDay(now), to: endOfDay(now) };
    case 'yesterday': {
      const y = addDays(now, -1);
      return { preset, from: startOfDay(y), to: endOfDay(y) };
    }
    case 'last7':
      return { preset, from: startOfDay(addDays(now, -6)), to: endOfDay(now) };
    case 'last30':
      return { preset, from: startOfDay(addDays(now, -29)), to: endOfDay(now) };
    case 'thisMonth': {
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      return { preset, from: startOfDay(first), to: endOfDay(now) };
    }
    case 'all':
    default:
      return ALL_TIME_RANGE;
  }
}

const DEFAULT_PRESETS: readonly DateRangePreset[] = [
  'all',
  'today',
  'yesterday',
  'last7',
  'last30',
  'thisMonth',
  'custom',
] as const;

/**
 * Section 7 `DateRangePicker`, used by Transactions (§6.8) and Reports (§6.13).
 *
 * Presets lead, with a custom range behind them. That ordering is the point: a
 * merchant asking "what did I take yesterday?" should tap once, not operate a
 * calendar twice. The custom option exists for reconciliation and GST periods,
 * where an exact window genuinely matters.
 */
export function DateRangePicker({
  value,
  onChange,
  presets = DEFAULT_PRESETS,
  testID,
}: DateRangePickerProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  // Staged custom values, applied only on confirm so a half-picked range never
  // triggers a query.
  const [customFrom, setCustomFrom] = useState<Date>(value.from ?? addDays(new Date(), -6));
  const [customTo, setCustomTo] = useState<Date>(value.to ?? new Date());
  const [picking, setPicking] = useState<'from' | 'to' | null>(null);

  const formatDate = (date: Date): string => {
    const { day, monthKey, year } = dateParts(date.toISOString());
    return `${day} ${t(monthKey)} ${year}`;
  };

  const summary =
    value.preset === 'custom' && value.from && value.to
      ? `${formatDate(value.from)} – ${formatDate(value.to)}`
      : t(`dateRange.${value.preset}`);

  const selectPreset = (preset: DateRangePreset) => {
    if (preset === 'custom') {
      setPicking('from');
      return;
    }
    onChange(resolvePreset(preset));
    setOpen(false);
  };

  const handlePicked = (event: DateTimePickerEvent, selected?: Date) => {
    const which = picking;

    // Android's dialog is modal and reports dismissal; close out on cancel.
    if (Platform.OS === 'android') setPicking(null);
    if (event.type === 'dismissed' || !selected) return;

    if (which === 'from') {
      setCustomFrom(selected);
      // Keep the range valid: a `from` after `to` would produce an empty result
      // set with no explanation.
      if (selected > customTo) setCustomTo(selected);
      if (Platform.OS === 'android') setPicking('to');
    } else if (which === 'to') {
      setCustomTo(selected < customFrom ? customFrom : selected);
    }
  };

  const applyCustom = () => {
    onChange({ preset: 'custom', from: startOfDay(customFrom), to: endOfDay(customTo) });
    setPicking(null);
    setOpen(false);
  };

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${t('dateRange.label')}: ${summary}`}
        style={({ pressed }) => [styles.trigger, pressed && styles.pressed]}
        testID={testID}
      >
        <Ionicons name="calendar-outline" size={16} color={colors.textSecondary} />
        <Text style={styles.triggerLabel} numberOfLines={1}>
          {summary}
        </Text>
        <Ionicons name="chevron-down" size={14} color={colors.textTertiary} />
      </Pressable>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} />

        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.sheetTitle}>{t('dateRange.label')}</Text>

          {presets.map((preset) => {
            const selected = value.preset === preset;
            return (
              <Pressable
                key={preset}
                onPress={() => selectPreset(preset)}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                android_ripple={{ color: 'rgba(0,0,0,0.06)' }}
                style={({ pressed }) => [styles.option, pressed && styles.pressed]}
                testID={testID ? `${testID}-${preset}` : undefined}
              >
                <Text style={[styles.optionLabel, selected && styles.optionLabelSelected]}>
                  {t(`dateRange.${preset}`)}
                </Text>
                {selected ? <Ionicons name="checkmark" size={20} color={colors.primary} /> : null}
              </Pressable>
            );
          })}

          {picking !== null ? (
            <View style={styles.customPanel}>
              <View style={styles.customRow}>
                <SecondaryButton
                  label={`${t('dateRange.from')}: ${formatDate(customFrom)}`}
                  onPress={() => setPicking('from')}
                  style={styles.customButton}
                />
                <SecondaryButton
                  label={`${t('dateRange.to')}: ${formatDate(customTo)}`}
                  onPress={() => setPicking('to')}
                  style={styles.customButton}
                />
              </View>

              <DateTimePicker
                value={picking === 'from' ? customFrom : customTo}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                maximumDate={new Date()}
                {...(picking === 'to' ? { minimumDate: customFrom } : {})}
                onChange={handlePicked}
              />

              <PrimaryButton label={t('common.confirm')} onPress={applyCustom} fullWidth />
            </View>
          ) : null}
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    minHeight: 36,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  triggerLabel: { ...typography.smallMedium, color: colors.textSecondary, maxWidth: 160 },
  pressed: { opacity: 0.7 },
  backdrop: { flex: 1, backgroundColor: colors.overlay },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.md,
    maxHeight: '85%',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.borderStrong,
    alignSelf: 'center',
    marginVertical: spacing.sm,
  },
  sheetTitle: { ...typography.bodyLarge, color: colors.text, marginBottom: spacing.xs },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: MIN_TOUCH_TARGET,
    paddingVertical: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  optionLabel: { ...typography.body, color: colors.text, flex: 1 },
  optionLabelSelected: { color: colors.primary, fontWeight: '600' },
  customPanel: { marginTop: spacing.md, gap: spacing.sm },
  customRow: { flexDirection: 'row', gap: spacing.xs },
  customButton: { flex: 1 },
});
