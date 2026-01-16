"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { I18nProvider } from "../lib/i18n/I18nProvider";
import { AuthProvider } from "../lib/auth/AuthContext";
import { type Locale } from "../lib/i18n/locales";
import { UserPreferencesSync } from "../components/UserPreferencesSync";

import { AppRouterCacheProvider } from "@mui/material-nextjs/v14-appRouter";
import { DynamicThemeProvider } from "../components/DynamicThemeProvider";

export function Providers({ children, initialLocale }: { children: React.ReactNode; initialLocale: Locale }) {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 2 * 1000 } } }));

  return (
    <AppRouterCacheProvider>
      <QueryClientProvider client={queryClient}>
        <I18nProvider initialLocale={initialLocale}>
          <AuthProvider>
            <UserPreferencesSync />
            <DynamicThemeProvider>
              {children}
            </DynamicThemeProvider>
          </AuthProvider>
        </I18nProvider>
      </QueryClientProvider>
    </AppRouterCacheProvider>
  );
}
