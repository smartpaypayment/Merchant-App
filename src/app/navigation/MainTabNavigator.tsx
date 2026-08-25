import { StyleSheet, View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import { colors, radius, shadow, spacing, typography, MIN_TOUCH_TARGET } from '@theme/index';
import { HomeScreen } from '@features/home/HomeScreen';
import { CollectPaymentScreen } from '@features/collect/CollectPaymentScreen';
import { StaticQRScreen } from '@features/collect/StaticQRScreen';
import { AmountEntryScreen } from '@features/collect/AmountEntryScreen';
import { DynamicQRScreen } from '@features/collect/DynamicQRScreen';
import { PaymentLinkScreen } from '@features/collect/PaymentLinkScreen';
import { PaymentSuccessScreen } from '@features/collect/PaymentSuccessScreen';
import { TransactionsListScreen } from '@features/transactions/TransactionsListScreen';
import { TransactionDetailScreen } from '@features/transactions/TransactionDetailScreen';
import { RefundScreen } from '@features/refunds/RefundScreen';
import { SettlementsListScreen } from '@features/settlements/SettlementsListScreen';
import { MoreMenuScreen } from '@features/profile/MoreMenuScreen';
import type {
  CollectStackParamList,
  MainTabParamList,
  MoreStackParamList,
  SettlementsStackParamList,
  TransactionsStackParamList,
} from './types';

const Tab = createBottomTabNavigator<MainTabParamList>();

/*
 * Each tab owns a stack so pushed detail screens keep the tab bar visible and
 * retain their own back history (Section 4:
 *   Transactions → TransactionsList → TransactionDetail → RefundScreen).
 * Detail routes are registered as those steps are built.
 */

const CollectStack = createNativeStackNavigator<CollectStackParamList>();
function CollectNavigator() {
  return (
    <CollectStack.Navigator screenOptions={{ headerShown: false }}>
      <CollectStack.Screen name="CollectPayment" component={CollectPaymentScreen} />
      <CollectStack.Screen name="StaticQR" component={StaticQRScreen} />
      <CollectStack.Screen name="AmountEntry" component={AmountEntryScreen} />
      <CollectStack.Screen name="QRScreen" component={DynamicQRScreen} />
      <CollectStack.Screen name="PaymentLink" component={PaymentLinkScreen} />
      <CollectStack.Screen
        name="PaymentSuccess"
        component={PaymentSuccessScreen}
        // No swipe-back off a completed payment: the QR it came from is dead, and
        // returning to it would show a stale "waiting" screen.
        options={{ gestureEnabled: false, animation: 'fade' }}
      />
    </CollectStack.Navigator>
  );
}

const TransactionsStack = createNativeStackNavigator<TransactionsStackParamList>();
function TransactionsNavigator() {
  return (
    <TransactionsStack.Navigator screenOptions={{ headerShown: false }}>
      <TransactionsStack.Screen name="TransactionsList" component={TransactionsListScreen} />
      <TransactionsStack.Screen name="TransactionDetail" component={TransactionDetailScreen} />
      <TransactionsStack.Screen
        name="Refund"
        component={RefundScreen}
        // No swipe-back mid-refund: an accidental edge swipe while the re-auth
        // sheet is open should not silently abandon a money movement.
        options={{ gestureEnabled: false }}
      />
    </TransactionsStack.Navigator>
  );
}

const SettlementsStack = createNativeStackNavigator<SettlementsStackParamList>();
function SettlementsNavigator() {
  return (
    <SettlementsStack.Navigator screenOptions={{ headerShown: false }}>
      <SettlementsStack.Screen name="SettlementsList" component={SettlementsListScreen} />
    </SettlementsStack.Navigator>
  );
}

const MoreStack = createNativeStackNavigator<MoreStackParamList>();
function MoreNavigator() {
  return (
    <MoreStack.Navigator screenOptions={{ headerShown: false }}>
      <MoreStack.Screen name="MoreMenu" component={MoreMenuScreen} />
    </MoreStack.Navigator>
  );
}

/**
 * The centre "Collect" tab is raised into a FAB (Section 4: "'Collect' is the
 * prominent center action (FAB-style)"). It is a real tab rather than a floating
 * button so it participates in tab state and accessibility focus order.
 */
function CollectTabIcon({ focused }: { focused: boolean }) {
  return (
    <View style={[styles.fab, focused && styles.fabFocused]}>
      <Ionicons name="qr-code" size={26} color={colors.textInverse} />
    </View>
  );
}

export function MainTabNavigator() {
  const { t } = useTranslation();

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textTertiary,
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: styles.tabLabel,
        tabBarItemStyle: styles.tabItem,
        // Keeps inactive tabs unmounted until first visit — meaningful on a
        // 2GB device (Section 2 / NFR 5.1).
        lazy: true,
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarLabel: t('tabs.home'),
          tabBarIcon: ({ color, size }) => <Ionicons name="home-outline" size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="Transactions"
        component={TransactionsNavigator}
        options={{
          tabBarLabel: t('tabs.transactions'),
          tabBarIcon: ({ color, size }) => <Ionicons name="receipt-outline" size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="Collect"
        component={CollectNavigator}
        options={{
          tabBarLabel: '',
          tabBarAccessibilityLabel: t('tabs.collect'),
          tabBarIcon: ({ focused }) => <CollectTabIcon focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Settlements"
        component={SettlementsNavigator}
        options={{
          tabBarLabel: t('tabs.settlements'),
          tabBarIcon: ({ color, size }) => <Ionicons name="wallet-outline" size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="More"
        component={MoreNavigator}
        options={{
          tabBarLabel: t('tabs.more'),
          tabBarIcon: ({ color, size }) => <Ionicons name="grid-outline" size={size} color={color} />,
        }}
      />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    height: 64,
    paddingBottom: spacing.xs,
    paddingTop: spacing.xxs,
    backgroundColor: colors.surface,
    borderTopColor: colors.border,
  },
  tabItem: { minHeight: MIN_TOUCH_TARGET },
  tabLabel: { ...typography.caption, fontWeight: '500' },
  fab: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    // Lifts the button above the bar without overflowing its bounds.
    marginBottom: 22,
    borderWidth: 4,
    borderColor: colors.surface,
    ...shadow.raised,
  },
  fabFocused: { backgroundColor: colors.primaryDark },
});
