import { StatusBar } from 'expo-status-bar';
import { AppProviders } from '@app/providers/AppProviders';
import { RootNavigator } from '@app/navigation/RootNavigator';

/**
 * App entry. Providers wrap navigation so `RootNavigator` can read the query
 * client and localized strings while deciding which branch to mount.
 */
export default function App() {
  return (
    <AppProviders>
      <StatusBar style="dark" />
      <RootNavigator />
    </AppProviders>
  );
}
