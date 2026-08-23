import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radius, spacing } from '@theme/index';

interface SkeletonProps {
  width?: DimensionValue;
  height?: number;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * Shimmer placeholder (Section 7 `LoadingSkeleton`).
 *
 * Animates opacity only — driven natively — rather than a translating gradient.
 * On the 2GB Android 8 devices in Section 2 a moving gradient across several
 * placeholders costs real frames; a native opacity pulse is effectively free.
 */
export function Skeleton({ width = '100%', height = 16, borderRadius = radius.sm, style }: SkeletonProps) {
  const pulse = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.4,
          duration: 700,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [pulse]);

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[{ width, height, borderRadius, backgroundColor: colors.skeleton, opacity: pulse }, style]}
    />
  );
}

/** Skeleton matching the Home summary card's shape. */
export function SummaryCardSkeleton() {
  return (
    <View style={styles.card}>
      <Skeleton width="45%" height={14} />
      <Skeleton width="60%" height={36} style={styles.gapLg} />
      <View style={styles.row}>
        <Skeleton width="40%" height={14} />
        <Skeleton width="30%" height={14} />
      </View>
    </View>
  );
}

/** Skeleton matching a `TransactionRow`. */
export function TransactionRowSkeleton() {
  return (
    <View style={styles.txnRow}>
      <Skeleton width={40} height={40} borderRadius={20} />
      <View style={styles.txnBody}>
        <Skeleton width="55%" height={15} />
        <Skeleton width="35%" height={12} style={styles.gapSm} />
      </View>
      <Skeleton width={70} height={18} />
    </View>
  );
}

export function ListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <View accessibilityElementsHidden>
      {Array.from({ length: count }, (_, i) => (
        <TransactionRowSkeleton key={i} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.md },
  gapLg: { marginTop: spacing.sm },
  gapSm: { marginTop: spacing.xs },
  txnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  txnBody: { flex: 1 },
});
