import React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { colors, spacing } from '@theme/index';
import { OfflineBanner } from './OfflineBanner';

export interface ScreenProps {
  children: React.ReactNode;
  /** Wraps content in a ScrollView. Use `false` for screens with their own FlatList. */
  scroll?: boolean;
  /** Adds the standard 16dp horizontal gutter. */
  padded?: boolean;
  /** Mounts the shared `OfflineBanner` below the status bar. */
  showOfflineBanner?: boolean;
  /** Lifts content above the keyboard — needed on every form screen. */
  keyboardAvoiding?: boolean;
  backgroundColor?: string;
  edges?: readonly Edge[];
  contentContainerStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
  /** Pull-to-refresh control, forwarded to the internal ScrollView. */
  refreshControl?: React.ComponentProps<typeof ScrollView>['refreshControl'];
  testID?: string;
}

/**
 * Common screen shell: safe-area insets, optional scrolling, keyboard avoidance,
 * and the offline banner from Section 11.
 *
 * Centralizing this means every screen inherits the offline affordance and safe
 * insets rather than each one re-deriving them.
 */
export function Screen({
  children,
  scroll = false,
  padded = true,
  showOfflineBanner = true,
  keyboardAvoiding = false,
  backgroundColor = colors.background,
  edges = ['top', 'left', 'right'],
  contentContainerStyle,
  style,
  refreshControl,
  testID,
}: ScreenProps) {
  const inner = scroll ? (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[padded && styles.padded, styles.scrollContent, contentContainerStyle]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      {...(refreshControl ? { refreshControl } : {})}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.flex, padded && styles.padded, contentContainerStyle]}>{children}</View>
  );

  const body = keyboardAvoiding ? (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {inner}
    </KeyboardAvoidingView>
  ) : (
    inner
  );

  return (
    <SafeAreaView testID={testID} edges={edges} style={[styles.flex, { backgroundColor }, style]}>
      {showOfflineBanner ? <OfflineBanner /> : null}
      {body}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  padded: { paddingHorizontal: spacing.md },
  scrollContent: { paddingBottom: spacing.xl, flexGrow: 1 },
});
