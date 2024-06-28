import { useCallback, useEffect, useMemo, useState } from "react";
import { z } from "zod";

import { useUpdatingRef } from "./useUpdatingRef";

export function useLocalStorage<T>({ key, schema }: { key: string; schema: z.ZodType<T> }, initialValue: T) {
  const schemaRef = useUpdatingRef(schema);
  const initialValueRef = useUpdatingRef(initialValue);

  // Get the value from local storage
  const storedValue = useMemo(
    () => getLocalStorage({ key, schema: schemaRef.current }, initialValueRef.current),
    [initialValueRef, key, schemaRef],
  );

  // State to store our value
  const [currentValue, setCurrentValue] = useState(storedValue);
  const currentValueRef = useUpdatingRef(currentValue);
  useEffect(() => setCurrentValue(storedValue), [storedValue]);

  // Return a wrapped version of useState's setter function that persists the new value to localStorage.
  const setValue = useCallback(
    (value: T | ((val: T) => T)) => {
      try {
        // Allow value to be a function so we have same API as useState
        const valueToStore = value instanceof Function ? value(currentValueRef.current) : value;
        currentValueRef.current = valueToStore;
        // Save to local storage
        localStorage.setItem(key, JSON.stringify(valueToStore));
        // Save state
        setCurrentValue(valueToStore);
      } catch (error) {
        // A more advanced implementation would handle the error case
        console.log(error);
      }
    },
    [currentValueRef, key],
  );

  return [currentValue, setValue] as const;
}

export function getLocalStorage<T>({ key, schema }: { key: string; schema: z.ZodType<T> }, initialValue: T): T {
  try {
    // Get from local storage by key
    const item = localStorage.getItem(key);
    // Parse stored json or if none return initialValue
    return item ? schema.parse(JSON.parse(item)) : initialValue;
  } catch (error) {
    // If error also return initialValue
    console.log(error);
    return initialValue;
  }
}
