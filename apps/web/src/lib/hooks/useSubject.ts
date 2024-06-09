import { useState } from "react";
import { BehaviorSubject, Subject } from "rxjs";

export function useSubject<T = true>() {
  return useState(() => new Subject<T>())[0];
}

export function useBehaviorSubject<T>(initialValue: T | (() => T)) {
  return useState(
    () =>
      new BehaviorSubject<T>(
        typeof initialValue === "function"
          ? (initialValue as () => T)()
          : initialValue
      )
  )[0];
}
