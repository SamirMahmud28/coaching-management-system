"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api-client";
import { notifyError } from "@/lib/feedback";

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            // A 4xx is an answer, not a transient failure.
            retry: (failureCount, error) =>
              !(error instanceof ApiError && error.status >= 400 && error.status < 500) && failureCount < 2,
          },
          mutations: { retry: false },
        },
      }),
  );
  // Backstop for a handler that forgot its try/catch: the server's message still reaches the user as a toast.
  useEffect(() => {
    function onUnhandled(event: PromiseRejectionEvent) {
      if (!(event.reason instanceof ApiError)) return;
      event.preventDefault();
      notifyError(event.reason);
    }
    window.addEventListener("unhandledrejection", onUnhandled);
    return () => window.removeEventListener("unhandledrejection", onUnhandled);
  }, []);

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
