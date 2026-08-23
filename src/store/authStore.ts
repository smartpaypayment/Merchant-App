import { create } from 'zustand';
import type { Merchant } from '@models/index';
import { merchantApi } from '@api/index';
import { ApiError } from '@api/errors';
import { clearTokens, getAccessToken, saveTokens, type TokenPair } from './secureStorage';
import { storage, StorageKeys } from './storage';

/**
 * Session state. Deliberately narrow: it answers only "which navigation branch
 * should be mounted", plus the merchant identity that drives that decision.
 * All other server data lives in React Query.
 */
export type SessionStatus = 'bootstrapping' | 'unauthenticated' | 'authenticated';

interface AuthState {
  status: SessionStatus;
  merchant: Merchant | null;
  /** Mobile awaiting OTP verification, carried between Login and OTPVerify. */
  pendingMobile: string | null;
  /** True when the profile came from cache because the network was unavailable. */
  isStaleProfile: boolean;

  bootstrap: () => Promise<void>;
  setPendingMobile: (mobile: string | null) => void;
  completeLogin: (tokens: TokenPair, isNewUser: boolean) => Promise<void>;
  refreshMerchant: () => Promise<void>;
  setMerchant: (merchant: Merchant) => void;
  logout: () => Promise<void>;
}

/**
 * Section 6.4 progressive KYC gate.
 *
 * A merchant is held in the onboarding wizard only while KYC has not yet been
 * *submitted*. Once it reaches review (or is approved) they get the full app,
 * with server-side limits doing the actual restricting. `rejected` also falls
 * through to the app so the merchant can see the reason on Home rather than
 * being trapped in the wizard.
 */
export function needsOnboarding(merchant: Merchant | null): boolean {
  if (!merchant) return false;
  return merchant.kycStatus === 'not_started' || merchant.kycStatus === 'in_progress';
}

export const useAuthStore = create<AuthState>((set, get) => ({
  status: 'bootstrapping',
  merchant: null,
  pendingMobile: null,
  isStaleProfile: false,

  /**
   * Splash-screen logic (Section 6.1): check secure storage for a valid token,
   * then route to Main or Login.
   */
  bootstrap: async () => {
    const token = await getAccessToken();

    if (!token) {
      set({ status: 'unauthenticated', merchant: null, isStaleProfile: false });
      return;
    }

    try {
      const merchant = await merchantApi.getProfile();
      await storage.setObject(StorageKeys.merchantCache, merchant);
      set({ status: 'authenticated', merchant, isStaleProfile: false });
    } catch (error) {
      // 401 means the token (and refresh) are dead — the interceptor already
      // cleared them, so send the merchant to Login.
      if (error instanceof ApiError && error.code === 'unauthorized') {
        set({ status: 'unauthenticated', merchant: null, isStaleProfile: false });
        return;
      }

      // Offline or server trouble: honour the token we hold and boot from cache
      // so the merchant can still see their data (Section 11).
      const cached = await storage.getObject<Merchant>(StorageKeys.merchantCache);
      if (cached) {
        set({ status: 'authenticated', merchant: cached, isStaleProfile: true });
      } else {
        set({ status: 'unauthenticated', merchant: null, isStaleProfile: false });
      }
    }
  },

  setPendingMobile: (mobile) => set({ pendingMobile: mobile }),

  completeLogin: async (tokens, isNewUser) => {
    await saveTokens(tokens);

    try {
      const merchant = await merchantApi.getProfile();
      await storage.setObject(StorageKeys.merchantCache, merchant);
      set({ status: 'authenticated', merchant, pendingMobile: null, isStaleProfile: false });
    } catch {
      // A brand-new signup may not have a profile yet; either way the token is
      // valid, so enter the authenticated tree and let the wizard populate it.
      set({
        status: 'authenticated',
        merchant: isNewUser ? null : get().merchant,
        pendingMobile: null,
        isStaleProfile: false,
      });
    }
  },

  refreshMerchant: async () => {
    try {
      const merchant = await merchantApi.getProfile();
      await storage.setObject(StorageKeys.merchantCache, merchant);
      set({ merchant, isStaleProfile: false });
    } catch {
      // Keep whatever we already have; callers surface their own error UI.
    }
  },

  setMerchant: (merchant) => {
    set({ merchant, isStaleProfile: false });
    void storage.setObject(StorageKeys.merchantCache, merchant);
  },

  logout: async () => {
    await clearTokens();
    await storage.remove(StorageKeys.merchantCache);
    await storage.remove(StorageKeys.kycDraft);
    set({ status: 'unauthenticated', merchant: null, pendingMobile: null, isStaleProfile: false });
  },
}));

/* -------------------------------- selectors ------------------------------- */

export const useSessionStatus = (): SessionStatus => useAuthStore((s) => s.status);
export const useMerchant = (): Merchant | null => useAuthStore((s) => s.merchant);
export const useNeedsOnboarding = (): boolean => useAuthStore((s) => needsOnboarding(s.merchant));
