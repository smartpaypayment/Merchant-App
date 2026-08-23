import { useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, radius, spacing, typography, MIN_TOUCH_TARGET } from '@theme/index';

export interface SelectOption {
  value: string;
  /** Already-localized label. */
  label: string;
}

export interface SelectFieldProps {
  label: string;
  value: string | undefined;
  options: readonly SelectOption[];
  onChange: (value: string) => void;
  placeholder: string;
  /** Bottom-sheet heading. */
  sheetTitle: string;
  error?: string | undefined;
  helper?: string | undefined;
  testID?: string;
}

/**
 * Bottom-sheet picker, used for the MCC category dropdown in KYC Step 1.
 *
 * A modal sheet rather than a native `Picker`: the option labels are localized
 * into Indic scripts and can be long, which the compact native picker truncates
 * badly on small screens.
 */
export function SelectField({
  label,
  value,
  options,
  onChange,
  placeholder,
  sheetTitle,
  error,
  helper,
  testID,
}: SelectFieldProps) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>

      <Pressable
        testID={testID}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${label}. ${selected?.label ?? placeholder}`}
        style={({ pressed }) => [styles.field, !!error && styles.fieldError, pressed && styles.pressed]}
      >
        <Text style={[styles.value, !selected && styles.placeholder]} numberOfLines={1}>
          {selected?.label ?? placeholder}
        </Text>
        <Ionicons name="chevron-down" size={20} color={colors.textTertiary} />
      </Pressable>

      {error ? (
        <View style={styles.messageRow}>
          <Ionicons name="alert-circle" size={14} color={colors.error} />
          <Text style={styles.errorText} accessibilityRole="alert">
            {error}
          </Text>
        </View>
      ) : helper ? (
        <Text style={styles.helperText}>{helper}</Text>
      ) : null}

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} />
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{sheetTitle}</Text>
            <Pressable
              onPress={() => setOpen(false)}
              hitSlop={12}
              accessibilityRole="button"
              style={styles.closeButton}
            >
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </Pressable>
          </View>

          <FlatList
            data={options}
            keyExtractor={(item) => item.value}
            renderItem={({ item }) => {
              const isSelected = item.value === value;
              return (
                <Pressable
                  onPress={() => {
                    onChange(item.value);
                    setOpen(false);
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isSelected }}
                  android_ripple={{ color: 'rgba(0,0,0,0.06)' }}
                  style={({ pressed }) => [styles.option, pressed && styles.pressed]}
                >
                  <Text style={[styles.optionLabel, isSelected && styles.optionLabelSelected]}>
                    {item.label}
                  </Text>
                  {isSelected ? <Ionicons name="checkmark" size={20} color={colors.primary} /> : null}
                </Pressable>
              );
            }}
          />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: spacing.md },
  label: { ...typography.smallMedium, color: colors.textSecondary, marginBottom: spacing.xxs },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: MIN_TOUCH_TARGET,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
    gap: spacing.xs,
  },
  fieldError: { borderColor: colors.error },
  pressed: { opacity: 0.7 },
  value: { ...typography.body, color: colors.text, flex: 1 },
  placeholder: { color: colors.textTertiary },
  messageRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.xxs, gap: spacing.xxs },
  errorText: { ...typography.caption, color: colors.error, flex: 1 },
  helperText: { ...typography.caption, color: colors.textTertiary, marginTop: spacing.xxs },
  backdrop: { flex: 1, backgroundColor: colors.overlay },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingBottom: spacing.xl,
    maxHeight: '75%',
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
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: MIN_TOUCH_TARGET + 4,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    gap: spacing.xs,
  },
  optionLabel: { ...typography.body, color: colors.text, flex: 1 },
  optionLabelSelected: { color: colors.primary, fontWeight: '600' },
});
