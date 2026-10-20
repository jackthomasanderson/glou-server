'use client';
import { useEffect } from 'react';

// #428: Next.js metadata sets a static tab title because the server can't
// know the client-side active language. Once i18n is ready, override it
// with the active language only. #530: also used by the public pages
// (sign-in, sign-up, password reset, guest share).
export function useBrowserTabTitle(label: string | undefined) {
  useEffect(() => {
    if (!label) return;
    document.title = `${label} — Glou`;
  }, [label]);
}
