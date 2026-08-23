import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { colors } from '@theme/index';
import { KycWizardScreen } from '@features/onboarding/KycWizardScreen';
import { KycDoneScreen } from '@features/onboarding/KycDoneScreen';
import type { OnboardingStackParamList } from './types';

const Stack = createNativeStackNavigator<OnboardingStackParamList>();

/**
 * KYC onboarding (Section 6.4).
 *
 * Separate from `AuthNavigator` — although Section 4 groups Onboarding under the
 * unauthenticated tree, every `PATCH /merchant/kyc` call needs a bearer token, so
 * the wizard is only reachable *after* OTP verification. Keeping it in its own
 * gated branch means the merchant cannot land here without a session, and cannot
 * navigate back into Login from it.
 *
 * The four form steps live inside `KycWizardScreen` rather than as four routes:
 * the wizard owns a single resumable draft and a shared progress indicator, and
 * per-step routes would let the hardware back button strand a merchant on a step
 * whose prerequisites were never saved.
 */
export function OnboardingNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="KycWizard" component={KycWizardScreen} />
      <Stack.Screen name="KycDone" component={KycDoneScreen} options={{ gestureEnabled: false }} />
    </Stack.Navigator>
  );
}
