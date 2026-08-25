import { useEffect, useState } from 'react';

/**
 * Trailing-edge debounce for a rapidly-changing value.
 *
 * Used for the transactions search box (Section 6.8): firing a request per
 * keystroke would, on the 2G/3G connections in Section 5.7, queue requests faster
 * than they resolve and leave the list showing results for a prefix the merchant
 * has already typed past.
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
