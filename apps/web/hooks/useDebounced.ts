'use client';

import { useEffect, useState } from 'react';

/**
 * The value, held back until it stops changing for `delay` ms.
 *
 * Search moved server-side when the tables were paginated, so every keystroke
 * would otherwise be a request. Debouncing keeps the input responsive and sends
 * one query for the word rather than one per letter.
 */
export function useDebounced<T>(value: T, delay = 300): T {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return settled;
}
