import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, radius, spacing, typography, MIN_TOUCH_TARGET } from '@theme/index';

export interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Already-localized consent text. */
  label: string;
  error?: string | undefined;
  disabled?: boolean;
  testID?: string;
}

/**
 * Consent checkbox — used for the Login T&C and the mandatory Aadhaar eKYC
 * consent in Section 6.4 Step 4.
 *
 * The whole row is the touch target (>= 48dp tall) because a bare 20dp box is a
 * frustrating tap on a low-end phone.
 */
export function Checkbox({ checked, onChange, label, error, disabled = false, testID }: CheckboxProps) {
  return (
    <View>
      <Pressable
        testID={testID}
        onPress={() => onChange(!checked)}
        disabled={disabled}
        accessibilityRole="checkbox"
        accessibilityState={{ checked, disabled }}
        accessibilityLabel={label}
        style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      >
        <View style={[styles.box, checked && styles.boxChecked, !!error && styles.boxError]}>
          {checked ? <Ionicons name="checkmark" size={16} color={colors.textInverse} /> : null}
        </View>
        <Text style={styles.label}>{label}</Text>
      </Pressable>

      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    minHeight: MIN_TOUCH_TARGET,
    paddingVertical: spacing.xs,
    gap: spacing.sm,
  },
  pressed: { opacity: 0.7 },
  box: {
    width: 22,
    height: 22,
    borderRadius: radius.sm,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    // Optically aligns the box with the first line of label text.
    marginTop: 2,
  },
  boxChecked: { backgroundColor: colors.primary, borderColor: colors.primary },
  boxError: { borderColor: colors.error },
  label: { ...typography.small, color: colors.textSecondary, flex: 1 },
  error: { ...typography.caption, color: colors.error, marginTop: spacing.xxs },
});
