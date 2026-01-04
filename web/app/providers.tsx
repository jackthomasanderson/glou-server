"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { I18nProvider } from "../lib/i18n/I18nProvider";
import { AuthProvider } from "../lib/auth/AuthContext";
import { type Locale } from "../lib/i18n/locales";

export function Providers({ children, initialLocale }: { children: React.ReactNode; initialLocale: Locale }) {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 2 * 1000 } } }));

  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider initialLocale={initialLocale}>
        <AuthProvider>{children}</AuthProvider>
      </I18nProvider>
    </QueryClientProvider>
  );
}
