import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import { colors, spacing, typography } from '@theme/index';
import { useNetworkStatus } from '@hooks/useNetworkStatus';

/**
 * Section 7 / 11 `OfflineBanner`.
 *
 * Renders nothing while online, then slides in when connectivity drops. It reads
 * the shared `useNetworkStatus` hook so a screen only has to mount it once —
 * screens separately use `isOnline` to disable connectivity-dependent actions.
 */
export function OfflineBanner() {
  const { t } = useTranslation();
  const { isOnline } = useNetworkStatus();
  const translateY = useRef(new Animated.Value(-40)).current;

  useEffect(() => {
    Animated.timing(translateY, {
      toValue: isOnline ? -40 : 0,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [isOnline, translateY]);

  if (isOnline) return null;

  return (
    <Animated.View style={[styles.container, { transform: [{ translateY }] }]}>
      <View style={styles.row}>
        <Ionicons name="cloud-offline" size={16} color={colors.textInverse} />
        <Text style={styles.text} accessibilityRole="alert" numberOfLines={2}>
          {t('network.offlineBanner')}
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: colors.warning, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  text: { ...typography.caption, color: colors.textInverse, flex: 1 },
});
