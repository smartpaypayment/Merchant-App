import { useEffect } from 'react';
import { NavigationContainer, type LinkingOptions } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { colors } from '@theme/index';
import { setUnauthorizedHandler } from '@api/index';
import { needsOnboarding, useAuthStore } from '@store/authStore';
import { useLockManager } from '@store/lockManager';
import { LockScreen } from '@features/auth/LockScreen';
import { SplashScreen } from '@features/auth/SplashScreen';
import { NotificationsScreen } from '@features/notifications/NotificationsScreen';
import { AuthNavigator } from './AuthNavigator';
import { OnboardingNavigator } from './OnboardingNavigator';
import { MainTabNavigator } from './MainTabNavigator';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

/** Deep links for notification taps (Section 6.18: "deep-link to relevant screen"). */
const linking: LinkingOptions<RootStackParamList> = {
  prefixes: ['merchantone://', 'https://pay.merchantone.in'],
  config: {
    screens: {
      Main: {
        screens: {
          Home: 'home',
          Transactions: { screens: { TransactionsList: 'transactions' } },
          Settlements: { screens: { SettlementsList: 'settlements' } },
        },
      },
      Notifications: 'notifications',
    },
  },
};

/**
 * Root navigation gate (Section 4).
 *
 * The branch is chosen declaratively from session state rather than by imperative
 * `navigate` calls. Consequences that matter:
 *   - logging out anywhere in the app unmounts the authenticated tree instantly,
 *     with no chance of a stale authenticated screen staying on top;
 *   - a merchant who quits mid-KYC is returned to the wizard on next launch,
 *     because `kycStatus` still reads `in_progress` (Section 6.4 resumability).
 */
export function RootNavigator() {
  const status = useAuthStore((s) => s.status);
  const merchant = useAuthStore((s) => s.merchant);
  const bootstrap = useAuthStore((s) => s.bootstrap);
  const logout = useAuthStore((s) => s.logout);

  const isLockReady = useLockManager((s) => s.isReady);
  const isLocked = useLockManager((s) => s.isLocked);
  const initLock = useLockManager((s) => s.init);

  // Section 6.1: read secure storage and decide the initial route.
  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  // Section 12: decide whether the app opens locked, and start watching AppState.
  useEffect(() => {
    void initLock();
  }, [initLock]);

  // Section 9: a failed refresh must end the session. Wiring it here (rather than
  // inside the API layer) keeps `client.ts` free of store imports.
  //
  // `logout()` now owns the full teardown, including both query caches, so this
  // path and the merchant-initiated one in Settings cannot drift apart.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      void logout();
    });
    return () => setUnauthorizedHandler(null);
  }, [logout]);

  // Both decisions must resolve before the first paint. Waiting on the lock check
  // too is what prevents a flash of Home behind the lock screen on cold start.
  if (status === 'bootstrapping' || !isLockReady) return <SplashScreen />;

  /*
   * The lock replaces the authenticated tree rather than covering it. Rendering it
   * as a sibling screen or a modal would leave Home mounted underneath, so the
   * day's takings would still be readable behind the sheet and would still be
   * captured in the app-switcher thumbnail.
   *
   * It is gated on `authenticated`: there is nothing to protect on the Login
   * screen, and locking an unauthenticated app would be a dead end.
   */
  if (status === 'authenticated' && isLocked) return <LockScreen />;

  const showOnboarding = status === 'authenticated' && needsOnboarding(merchant);
  const showMain = status === 'authenticated' && !showOnboarding;

  return (
    <NavigationContainer linking={linking}>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        {showMain ? (
          <>
            <Stack.Screen name="Main" component={MainTabNavigator} />
            <Stack.Screen
              name="Notifications"
              component={NotificationsScreen}
              options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
            />
          </>
        ) : showOnboarding ? (
          <Stack.Screen name="Onboarding" component={OnboardingNavigator} />
        ) : (
          <Stack.Screen name="Auth" component={AuthNavigator} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
