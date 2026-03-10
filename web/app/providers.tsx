'use client';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { I18nProvider } from './I18nProvider';
import { ThemeWrapper } from '@/components/ui/ThemeWrapper';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 1000 * 30, // 30s SWR
    },
  },
});

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider>
      <QueryClientProvider client={queryClient}>
        <ThemeWrapper>
          {children}
          {process.env.NODE_ENV === 'development' && <ReactQueryDevtools />}
        </ThemeWrapper>
      </QueryClientProvider>
    </I18nProvider>
  );
}
