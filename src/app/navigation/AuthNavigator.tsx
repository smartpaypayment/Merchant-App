import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { colors } from '@theme/index';
import { LoginScreen } from '@features/auth/LoginScreen';
import { OTPVerifyScreen } from '@features/auth/OTPVerifyScreen';
import type { AuthStackParamList } from './types';

const Stack = createNativeStackNavigator<AuthStackParamList>();

/**
 * Unauthenticated stack (Section 4).
 *
 * Splash is not a route here: it is rendered by `RootNavigator` while the session
 * bootstraps, so there is no back-navigable "Splash" entry in the history.
 *
 * Onboarding/KYC also lives outside this stack — see `OnboardingNavigator` — as
 * every KYC call requires a bearer token, making it an authenticated flow.
 */
export function AuthNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="OTPVerify" component={OTPVerifyScreen} />
    </Stack.Navigator>
  );
}
