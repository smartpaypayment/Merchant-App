import { useCallback, useEffect, useState } from 'react';
import { KycStep, type KycDraft } from '@models/kyc';
import { clearKycDraft, loadKycDraft, saveKycDraft } from '@store/kycDraftStorage';

const EMPTY_DRAFT: KycDraft = { currentStep: KycStep.BusinessInfo, completedThrough: 0 };

/**
 * Locally persisted KYC wizard draft.
 *
 * Section 6.4: "Each step savable/resumable."
 *
 * The draft is written to local storage after every successful step so a merchant
 * on a flaky 2G connection — or one who force-quits the app — resumes exactly
 * where they stopped instead of retyping their PAN and bank details.
 *
 * Storage is split by sensitivity, in `@store/kycDraftStorage`: progress and
 * non-secret fields go to AsyncStorage, while the PAN and the full bank account
 * number go to the Keystore/Keychain. The Aadhaar number is never persisted at
 * all — the draft holds only the consent flag and the last four digits the server
 * returns. Together that satisfies the Section 12 rule on sensitive data at rest
 * without giving up resumability.
 */
export function useKycDraft(): {
  draft: KycDraft;
  isLoaded: boolean;
  /** Records a completed step and advances `currentStep`. */
  completeStep: <K extends keyof KycDraft>(step: KycStep, key: K, data: KycDraft[K]) => Promise<void>;
  goToStep: (step: KycStep) => Promise<void>;
  clear: () => Promise<void>;
} {
  const [draft, setDraft] = useState<KycDraft>(EMPTY_DRAFT);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const saved = await loadKycDraft();
      if (!cancelled) {
        if (saved) setDraft(saved);
        setIsLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const completeStep = useCallback(
    async <K extends keyof KycDraft>(step: KycStep, key: K, data: KycDraft[K]) => {
      setDraft((current) => {
        const next: KycDraft = {
          ...current,
          [key]: data,
          completedThrough: Math.max(current.completedThrough, step) as KycStep,
          // Advance, but never past the terminal step.
          currentStep: Math.min(step + 1, KycStep.Done) as KycStep,
          updatedAt: new Date().toISOString(),
        };
        void saveKycDraft(next);
        return next;
      });
    },
    [],
  );

  const goToStep = useCallback(
    async (step: KycStep) => {
      setDraft((current) => {
        const next = { ...current, currentStep: step };
        void saveKycDraft(next);
        return next;
      });
    },
    [],
  );

  const clear = useCallback(async () => {
    setDraft(EMPTY_DRAFT);
    await clearKycDraft();
  }, []);

  return { draft, isLoaded, completeStep, goToStep, clear };
}
