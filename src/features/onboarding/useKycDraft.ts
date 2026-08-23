import { useCallback, useEffect, useState } from 'react';
import { KycStep, type KycDraft } from '@models/kyc';
import { storage, StorageKeys } from '@store/storage';

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
 * Only non-sensitive progress data is kept. Notably the Aadhaar number is never
 * written here: the draft stores the consent flag and the last four digits the
 * server returns, matching the Section 12 rule on sensitive data at rest.
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
      const saved = await storage.getObject<KycDraft>(StorageKeys.kycDraft);
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
        void storage.setObject(StorageKeys.kycDraft, next);
        return next;
      });
    },
    [],
  );

  const goToStep = useCallback(
    async (step: KycStep) => {
      setDraft((current) => {
        const next = { ...current, currentStep: step };
        void storage.setObject(StorageKeys.kycDraft, next);
        return next;
      });
    },
    [],
  );

  const clear = useCallback(async () => {
    setDraft(EMPTY_DRAFT);
    await storage.remove(StorageKeys.kycDraft);
  }, []);

  return { draft, isLoaded, completeStep, goToStep, clear };
}
