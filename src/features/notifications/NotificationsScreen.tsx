import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, radius, spacing, typography, MIN_TOUCH_TARGET } from '@theme/index';
import { EmptyState, ErrorState, ListSkeleton, Screen } from '@components/index';
import { miscApi } from '@api/index';
import { queryKeys } from '@app/providers/queryClient';
import type { NotificationItem } from '@models/index';
import { formatTime, relativeDayKey } from '@utils/date';

const TYPE_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  payment_received: 'arrow-down-circle-outline',
  settlement_credited: 'wallet-outline',
  kyc_update: 'shield-checkmark-outline',
  offer: 'pricetag-outline',
};

/**
 * Section 6.18 Notifications Screen.
 *
 * Presented modally from the Home header bell. Handles loading / empty / error
 * states; unread rows carry both a tint and a dot so the distinction is not
 * conveyed by colour alone (Section 13).
 */
export function NotificationsScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: queryKeys.notifications,
    queryFn: miscApi.listNotifications,
  });

  const items = data?.items ?? [];

  const renderItem = ({ item }: { item: NotificationItem }) => {
    const dayKey = relativeDayKey(item.createdAt);
    const timeLabel = dayKey ? `${t(dayKey)} · ${formatTime(item.createdAt)}` : formatTime(item.createdAt);

    return (
      <Pressable
        style={({ pressed }) => [styles.row, !item.read && styles.rowUnread, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={`${item.title}. ${item.body}`}
      >
        <View style={styles.iconCircle}>
          <Ionicons
            name={TYPE_ICON[item.type] ?? 'notifications-outline'}
            size={20}
            color={colors.primary}
          />
        </View>
        <View style={styles.body}>
          <Text style={styles.title} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={styles.message} numberOfLines={2}>
            {item.body}
          </Text>
          <Text style={styles.time}>{timeLabel}</Text>
        </View>
        {!item.read ? <View style={styles.unreadDot} /> : null}
      </Pressable>
    );
  };

  return (
    <Screen padded={false} edges={['top', 'left', 'right']} testID="notifications-screen">
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('notifications.title')}</Text>
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={t('a11y.close')}
          style={styles.closeButton}
        >
          <Ionicons name="close" size={24} color={colors.text} />
        </Pressable>
      </View>

      {isLoading ? (
        <ListSkeleton count={5} />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          icon="notifications-off-outline"
          title={t('notifications.emptyTitle')}
          body={t('notifications.emptyBody')}
        />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          contentContainerStyle={styles.listContent}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  headerTitle: { ...typography.title, color: colors.text, flex: 1 },
  closeButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  listContent: { paddingBottom: spacing.xl },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    minHeight: MIN_TOUCH_TARGET,
    padding: spacing.md,
    gap: spacing.sm,
    backgroundColor: colors.surface,
  },
  rowUnread: { backgroundColor: colors.primaryLight },
  pressed: { opacity: 0.8 },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1 },
  title: { ...typography.bodyMedium, color: colors.text },
  message: { ...typography.small, color: colors.textSecondary, marginTop: 2 },
  time: { ...typography.caption, color: colors.textTertiary, marginTop: spacing.xxs },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    marginTop: spacing.xs,
  },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
});
