import { memo } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, radius, spacing, typography, MIN_TOUCH_TARGET } from '@theme/index';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';
type Size = 'md' | 'lg';

export interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: Variant;
  size?: Size;
  /** Shows a spinner and blocks presses (Section 7: "With loading state"). */
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  iconLeft?: keyof typeof Ionicons.glyphMap;
  iconRight?: keyof typeof Ionicons.glyphMap;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  /** Overrides the label for screen readers when the label alone lacks context. */
  accessibilityLabel?: string;
}

const VARIANT_STYLE: Record<Variant, { bg: string; fg: string; border?: string }> = {
  primary: { bg: colors.primary, fg: colors.textInverse },
  secondary: { bg: colors.surface, fg: colors.primary, border: colors.primary },
  danger: { bg: colors.error, fg: colors.textInverse },
  ghost: { bg: 'transparent', fg: colors.primary },
};

/**
 * Shared button. Height is floored at `MIN_TOUCH_TARGET` (48dp) to satisfy the
 * Section 5 / 13 touch-target requirement.
 *
 * While `loading` the label is kept mounted but hidden behind the spinner so the
 * button does not change width mid-request (which would shift the layout under
 * the merchant's finger).
 */
function ButtonBase({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  fullWidth = false,
  iconLeft,
  iconRight,
  style,
  testID,
  accessibilityLabel,
}: ButtonProps) {
  const isDisabled = disabled || loading;
  const palette = VARIANT_STYLE[variant];

  const backgroundColor = isDisabled && variant !== 'ghost' && variant !== 'secondary'
    ? colors.disabledSurface
    : palette.bg;
  const foregroundColor = isDisabled ? colors.disabled : palette.fg;

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      android_ripple={{ color: 'rgba(0,0,0,0.12)' }}
      style={({ pressed }) => [
        styles.base,
        size === 'lg' && styles.large,
        { backgroundColor },
        palette.border ? { borderWidth: 1.5, borderColor: isDisabled ? colors.disabled : palette.border } : null,
        fullWidth && styles.fullWidth,
        pressed && !isDisabled && styles.pressed,
        style,
      ]}
    >
      <View style={styles.content}>
        {loading ? <ActivityIndicator size="small" color={foregroundColor} style={styles.spinner} /> : null}
        {!loading && iconLeft ? (
          <Ionicons name={iconLeft} size={20} color={foregroundColor} style={styles.iconLeft} />
        ) : null}
        <Text
          style={[
            size === 'lg' ? typography.bodyLarge : typography.bodyMedium,
            { color: foregroundColor },
            loading && styles.hiddenLabel,
          ]}
          numberOfLines={1}
          maxFontSizeMultiplier={1.5}
        >
          {label}
        </Text>
        {!loading && iconRight ? (
          <Ionicons name={iconRight} size={20} color={foregroundColor} style={styles.iconRight} />
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  large: { minHeight: 56, borderRadius: radius.lg },
  fullWidth: { alignSelf: 'stretch' },
  pressed: { opacity: 0.85 },
  content: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  iconLeft: { marginRight: spacing.xs },
  iconRight: { marginLeft: spacing.xs },
  spinner: { position: 'absolute' },
  // Keeps the label's footprint so the button width is stable while loading.
  hiddenLabel: { opacity: 0 },
});

export const PrimaryButton = memo((props: Omit<ButtonProps, 'variant'>) => (
  <ButtonBase {...props} variant="primary" />
));
PrimaryButton.displayName = 'PrimaryButton';

export const SecondaryButton = memo((props: Omit<ButtonProps, 'variant'>) => (
  <ButtonBase {...props} variant="secondary" />
));
SecondaryButton.displayName = 'SecondaryButton';

export const DangerButton = memo((props: Omit<ButtonProps, 'variant'>) => (
  <ButtonBase {...props} variant="danger" />
));
DangerButton.displayName = 'DangerButton';

export const GhostButton = memo((props: Omit<ButtonProps, 'variant'>) => (
  <ButtonBase {...props} variant="ghost" />
));
GhostButton.displayName = 'GhostButton';

export const Button = memo(ButtonBase);
