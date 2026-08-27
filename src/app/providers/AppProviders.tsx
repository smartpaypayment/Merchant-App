import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { I18nextProvider } from 'react-i18next';
import { colors } from '@theme/index';
import i18n, { initI18n } from '@localization/i18n';
import { queryClient } from './queryClient';
import { installQueryLifecycleBridge } from './queryLifecycle';
import { queryPersister } from './queryPersister';

// Installed at module scope: `onlineManager`/`focusManager` are process-wide
// singletons, so this must happen exactly once and before the first query runs.
installQueryLifecycleBridge();

export function AppProviders({ children }: { children: ReactNode }) {
  // i18n must finish before the tree renders, otherwise the first paint shows
  // raw key names (Section 5: no hardcoded/untranslated text).
  const [i18nReady, setI18nReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    initI18n()
      .catch(() => {
        // Even if persistence lookup failed, i18n falls back to English —
        // better to render than to hang on the splash.
      })
      .finally(() => {
        if (!cancelled) setI18nReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!i18nReady) {
    return (
      <View style={styles.bootstrap}>
        <ActivityIndicator size="large" color={colors.textInverse} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <I18nextProvider i18n={i18n}>
        <PersistQueryClientProvider
          client={queryClient}
          persistOptions={{
            persister: queryPersister,
            maxAge: 24 * 60 * 60 * 1000,
            // Only cache reads worth restoring; never persist a failed query.
            dehydrateOptions: {
              shouldDehydrateQuery: (query) => query.state.status === 'success',
            },
          }}
        >
          {children}
        </PersistQueryClientProvider>
      </I18nextProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  bootstrap: { flex: 1, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
});
