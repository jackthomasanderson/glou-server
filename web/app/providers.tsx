'use client';
import React, { useEffect, useLayoutEffect } from 'react';
import { ToastProvider } from '@heroui/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createQueryClient } from '@/lib/queryClient';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { I18nProvider } from './I18nProvider';
import { ThemeWrapper } from '@/components/ui/ThemeWrapper';
import { TOAST_INSET_VAR, TOAST_PROPS } from '@/lib/toast';
import { useToastLayout } from '@/lib/toastClearance';
import { installClosingOverlayFocusGuard } from '@/lib/closingOverlayFocus';

const queryClient = createQueryClient();

/**
 * Single, app-wide feedback outlet (ux-ui.md 9.4: top-right). Every
 * success/error notification goes through lib/toast.ts. A message is read
 * whole: HeroUI cuts its title to one line (« Bouteille remise avec les a… »,
 * recette #471). Below a drawer's close button, never over it (recette v3 of
 * #471), nor over a drawer's actions or the navigation: beside it at the
 * bottom, or below its header (recette n°5 and n°5 bis of #847). Its own
 * component: a drawer opening re-renders it alone, not the app.
 */
function AppToasts() {
  const toast = useToastLayout();
  // Read by TOAST_PROPS' class: HeroUI sets a message's side, not how far from it.
  useLayoutEffect(() => {
    document.documentElement.style.setProperty(TOAST_INSET_VAR, `${toast.insetRight}px`);
  }, [toast.insetRight]);
  return <ToastProvider placement={toast.placement} toastOffset={toast.offset} toastProps={TOAST_PROPS} />;
}

export function Providers({ children }: { children: React.ReactNode }) {
  // #875: installed once, after React's own listeners and before any window's focus trap.
  useEffect(() => installClosingOverlayFocusGuard(document), []);
  return (
    <I18nProvider>
      <QueryClientProvider client={queryClient}>
        <ThemeWrapper>
          <AppToasts />
          {children}
          {process.env.NODE_ENV === 'development' && <ReactQueryDevtools />}
        </ThemeWrapper>
      </QueryClientProvider>
    </I18nProvider>
  );
}
