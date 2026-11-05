'use client';
import React from 'react';
import { ToastProvider } from '@heroui/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createQueryClient } from '@/lib/queryClient';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { I18nProvider } from './I18nProvider';
import { ThemeWrapper } from '@/components/ui/ThemeWrapper';
import { TOAST_OFFSET_PX, TOAST_PROPS } from '@/lib/toast';

const queryClient = createQueryClient();

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider>
      <QueryClientProvider client={queryClient}>
        <ThemeWrapper>
          {/* Single, app-wide feedback outlet (ux-ui.md 9.4: top-right).
              Every success/error notification goes through lib/toast.ts. */}
          {/* A message is read whole: HeroUI cuts its title to one line
              (« Bouteille remise avec les a… », recette #471). */}
          {/* Below a drawer's close button, never over it (recette v3 of #471). */}
          <ToastProvider placement="top-right" toastOffset={TOAST_OFFSET_PX} toastProps={TOAST_PROPS} />
          {children}
          {process.env.NODE_ENV === 'development' && <ReactQueryDevtools />}
        </ThemeWrapper>
      </QueryClientProvider>
    </I18nProvider>
  );
}
