'use client';
import React from 'react';
import { ToastProvider } from '@heroui/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createQueryClient } from '@/lib/queryClient';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { I18nProvider } from './I18nProvider';
import { ThemeWrapper } from '@/components/ui/ThemeWrapper';

const queryClient = createQueryClient();

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider>
      <QueryClientProvider client={queryClient}>
        <ThemeWrapper>
          {/* Single, app-wide feedback outlet (ux-ui.md 9.4: top-right).
              Every success/error notification goes through lib/toast.ts. */}
          <ToastProvider placement="top-right" />
          {children}
          {process.env.NODE_ENV === 'development' && <ReactQueryDevtools />}
        </ThemeWrapper>
      </QueryClientProvider>
    </I18nProvider>
  );
}
