import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { StorageKeys } from '@store/storage';

/**
 * Persists the React Query cache so the dashboard, transactions and settlements
 * are readable offline / at cold start (Section 11: "Cache dashboard,
 * transactions, settlements via React Query persistence").
 *
 * Lives in its own module — rather than inline in `AppProviders` — so the auth
 * store can purge it on logout without importing a React component tree. That
 * purge is not optional: see `purgePersistedQueryCache`.
 */
export const queryPersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: StorageKeys.queryCache,
  // Batches cache writes; without this every query settle hits disk, which is
  // noticeable on low-end storage.
  throttleTime: 2_000,
});

/**
 * Deletes the persisted cache from disk.
 *
 * Section 12: without this, logging out left a full copy of the previous
 * merchant's transactions, settlements, dashboard figures and profile in
 * AsyncStorage under `cache.reactQuery` for up to `maxAge` (24h) — restored on the
 * next launch even for a *different* merchant signing in on the same device. That
 * is a realistic scenario for a shared counter phone, not a hypothetical one.
 *
 * Call this **after** `queryClient.clear()`. The persister's writes are throttled,
 * so a write scheduled before the clear can still land after this removal — but
 * because the persister serialises the client's state at write time, the worst
 * case is that an *empty* cache gets rewritten. Doing it in the other order would
 * risk re-persisting live data over the deletion.
 */
export async function purgePersistedQueryCache(): Promise<void> {
  try {
    await queryPersister.removeClient();
  } catch {
    // Never block logout on a storage failure — the in-memory cache is already
    // gone and the tokens are cleared, which is the part that matters.
  }
}
