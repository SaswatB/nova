import { useEffect } from "react";
import { Observable } from "rxjs";

import { useUpdatingRef } from "./useUpdatingRef";

export function useObservableCallback<T>(
  observable: Observable<T> | undefined,
  onChange: (value: T) => void
) {
  const onChangeRef = useUpdatingRef(onChange);
  useEffect(() => {
    if (!observable) return undefined;

    const subscription = observable.subscribe((newValue) =>
      onChangeRef.current(newValue)
    );
    return () => subscription.unsubscribe();
  }, [observable, onChangeRef]);
}
