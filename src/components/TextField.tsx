import { forwardRef, useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, radius, spacing, typography, MIN_TOUCH_TARGET } from '@theme/index';

export interface TextFieldProps extends Omit<TextInputProps, 'style'> {
  label: string;
  /** Localized validation message; presence switches the field to its error state. */
  error?: string | undefined;
  /** Helper text shown when there is no error. */
  helper?: string | undefined;
  /** Rendered inside the field, before the input (e.g. the `+91` prefix). */
  prefix?: string;
  iconRight?: keyof typeof Ionicons.glyphMap;
  /** Appends a localized "Optional" marker to the label. */
  optionalLabel?: string;
  containerStyle?: StyleProp<ViewStyle>;
  /** Shows a trailing spinner/tick, used by the penny-drop + pincode lookups. */
  status?: 'idle' | 'validating' | 'valid';
  /**
   * Marks the field as holding an identity or banking secret — PAN, Aadhaar, a
   * bank account number (Section 12).
   *
   * Turns off the conveniences that would otherwise copy the value somewhere the
   * app does not control: autofill and autocomplete (which persist entries into an
   * OS-level suggestion store), plus autocorrect and the spell-check dictionary,
   * which on some Android keyboards learns typed strings and can surface them as
   * suggestions in *other* apps.
   *
   * Note this is not `secureTextEntry`: these fields must stay readable so the
   * merchant can check a long account number against their passbook before
   * submitting, and masking them would push people to type it into a notes app
   * first. Shoulder-surfing is handled where it actually matters — the PIN pad,
   * which renders dots and never numerals.
   */
  sensitive?: boolean;
}

/**
 * Labelled text input with error/helper slots.
 *
 * Errors are announced via `accessibilityLabel` on the message rather than only
 * through colour, so the failure is perceivable without colour vision
 * (Section 13 accessibility).
 */
export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  {
    label,
    error,
    helper,
    prefix,
    iconRight,
    optionalLabel,
    containerStyle,
    status = 'idle',
    sensitive = false,
    ...inputProps
  },
  ref,
) {
  const [focused, setFocused] = useState(false);
  const hasError = !!error;

  return (
    <View style={[styles.container, containerStyle]}>
      <Text style={styles.label}>
        {label}
        {optionalLabel ? <Text style={styles.optional}>{`  ${optionalLabel}`}</Text> : null}
      </Text>

      <View
        style={[
          styles.inputRow,
          focused && styles.inputRowFocused,
          hasError && styles.inputRowError,
        ]}
      >
        {prefix ? <Text style={styles.prefix}>{prefix}</Text> : null}

        <TextInput
          ref={ref}
          style={styles.input}
          placeholderTextColor={colors.textTertiary}
          selectionColor={colors.primary}
          accessibilityLabel={label}
          {...(hasError ? { 'aria-invalid': true } : {})}
          {...(sensitive
            ? {
                autoComplete: 'off' as const,
                autoCorrect: false,
                spellCheck: false,
                // Android: keeps the value out of the OS autofill store.
                importantForAutofill: 'no' as const,
                // iOS: prevents the keyboard offering it as a saved value.
                textContentType: 'none' as const,
              }
            : {})}
          onFocus={(e) => {
            setFocused(true);
            inputProps.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            inputProps.onBlur?.(e);
          }}
          {...inputProps}
        />

        {status === 'valid' ? (
          <Ionicons name="checkmark-circle" size={22} color={colors.success} />
        ) : iconRight ? (
          <Ionicons name={iconRight} size={20} color={colors.textTertiary} />
        ) : null}
      </View>

      {hasError ? (
        <View style={styles.messageRow}>
          <Ionicons name="alert-circle" size={14} color={colors.error} />
          <Text style={styles.errorText} accessibilityRole="alert">
            {error}
          </Text>
        </View>
      ) : helper ? (
        <Text style={styles.helperText}>{helper}</Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  container: { marginBottom: spacing.md },
  label: { ...typography.smallMedium, color: colors.textSecondary, marginBottom: spacing.xxs },
  optional: { ...typography.caption, color: colors.textTertiary, fontWeight: '400' },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: MIN_TOUCH_TARGET,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
  },
  inputRowFocused: { borderColor: colors.primary },
  inputRowError: { borderColor: colors.error },
  prefix: {
    ...typography.body,
    color: colors.textSecondary,
    marginRight: spacing.xs,
    paddingRight: spacing.xs,
    borderRightWidth: 1,
    borderRightColor: colors.border,
  },
  input: { flex: 1, ...typography.body, color: colors.text, paddingVertical: spacing.sm },
  messageRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.xxs, gap: spacing.xxs },
  errorText: { ...typography.caption, color: colors.error, flex: 1 },
  helperText: { ...typography.caption, color: colors.textTertiary, marginTop: spacing.xxs },
});
