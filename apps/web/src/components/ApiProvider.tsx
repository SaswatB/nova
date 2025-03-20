import React, { useMemo } from "react";
import { toast } from "react-toastify";
import { useAuth } from "@clerk/clerk-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";

import { formatError } from "../../../../packages/streamweave-core/src/lib/err";
import { env } from "../lib/env";
import { getLocalStorage } from "../lib/hooks/useLocalStorage";
import { useUpdatingRef } from "../lib/hooks/useUpdatingRef";
import { lsKey } from "../lib/keys";
import { trpc } from "../lib/trpc-client";

export function ApiProvider({ children }: { children: React.ReactNode }) {
  const getTokenRef = useUpdatingRef(useAuth().getToken);
  const queryClient = useMemo(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: 1, onError: (e) => toast.error(formatError(e)) },
          mutations: { onError: (e) => toast.error(formatError(e)) },
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const trpcClient = useMemo(() => {
    const link = httpBatchLink({
      url: `${env.VITE_API_URL}/trpc`,
      headers: async () => {
        if (getLocalStorage(lsKey.localModeEnabled, false)) throw new Error("Local mode is enabled");
        return { Authorization: `Bearer ${await getTokenRef.current()}` };
      },
    });
    return trpc.createClient({ links: [link] });
  }, [getTokenRef]);

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  );
}
