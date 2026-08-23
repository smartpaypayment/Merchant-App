import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { I18nextProvider } from 'react-i18next';
import { colors } from '@theme/index';
import i18n, { initI18n } from '@localization/i18n';
import { StorageKeys } from '@store/storage';
import { queryClient } from './queryClient';

/**
 * Persists the React Query cache so the dashboard, transactions and settlements
 * are readable offline / at cold start (Section 11: "Cache dashboard,
 * transactions, settlements via React Query persistence").
 */
const persister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: StorageKeys.queryCache,
  // Batches cache writes; without this every query settle hits disk, which is
  // noticeable on low-end storage.
  throttleTime: 2_000,
});

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
            persister,
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
