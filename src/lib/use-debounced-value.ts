"use client";

import { useEffect, useState } from "react";

/** `value`, but only once it has stopped changing for `delay` ms, so typing in a search box sends one request. */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
