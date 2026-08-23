import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Seconds-remaining countdown, used for the OTP resend timer (Section 6.3) and
 * the dynamic-QR expiry (Section 6.6).
 *
 * Driven off wall-clock deltas rather than by decrementing a counter each tick:
 * `setInterval` is throttled while the app is backgrounded, so a naive counter
 * drifts and would leave "Resend in 12s" frozen on screen after the merchant
 * switches back from their UPI app.
 */
export function useCountdown(initialSeconds: number): {
  secondsLeft: number;
  isRunning: boolean;
  restart: (seconds?: number) => void;
  stop: () => void;
} {
  const [secondsLeft, setSecondsLeft] = useState(initialSeconds);
  const deadlineRef = useRef<number>(Date.now() + initialSeconds * 1000);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clear = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const tick = useCallback(() => {
    const remaining = Math.max(0, Math.ceil((deadlineRef.current - Date.now()) / 1000));
    setSecondsLeft(remaining);
    if (remaining === 0) clear();
  }, [clear]);

  const start = useCallback(
    (seconds: number) => {
      clear();
      deadlineRef.current = Date.now() + seconds * 1000;
      setSecondsLeft(seconds);
      if (seconds > 0) {
        intervalRef.current = setInterval(tick, 500);
      }
    },
    [clear, tick],
  );

  useEffect(() => {
    start(initialSeconds);
    return clear;
    // Intentionally keyed only on mount: callers use `restart` to change duration.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const restart = useCallback((seconds?: number) => start(seconds ?? initialSeconds), [start, initialSeconds]);

  return { secondsLeft, isRunning: secondsLeft > 0, restart, stop: clear };
}
