import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { Providers } from './providers';
import { THEME_INIT_SCRIPT } from '@/lib/theme-mode';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  // #471 (recette v2): one neutral title for every page. The server can't
  // know the member's language (chosen in the browser), and a bilingual
  // title (« Inventory · Inventaire ») is what a tab showed whenever the
  // translated one (useBrowserTabTitle) was not applied over it. Same
  // value as NEUTRAL_TAB_TITLE there (a 'use client' module: not importable
  // as a value from this server component).
  title: 'Glou',
  // #428: same reason for the descriptions (here, in each page.tsx and in
  // public/manifest.json): written once, in the default language (French,
  // like <html lang>), never the two glued together. Link previews of a
  // pasted guest link show it.
  description: 'Gérez votre cave à vin, spiritueux et cigares. Application auto-hébergée et privée.',
  // FEAT-16/23: PWA manifest — see web/public/manifest.json. Icons live in
  // public/icons/; app/icon.png, app/apple-icon.png and app/favicon.ico are
  // picked up by Next's file conventions.
  manifest: '/manifest.json',
};

export const viewport: Viewport = {
  // The default accent's light-theme value (lib/theme-colors.ts) so the PWA
  // install/OS chrome tint doesn't contradict the interface it wraps.
  themeColor: '#4f46e5',
  // Without this, `env(safe-area-inset-*)` always resolves to 0 (ISSUE_401):
  // BottomNav.tsx's bottom inset was inert. Extends content under the system
  // bars, so MainLayout's header picks up the matching top inset below.
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased`} suppressHydrationWarning>
        {/*
          ISSUE_112: resolves light/dark before the first paint (stored choice,
          then prefers-color-scheme), so a reload no longer flashes white and
          the logged-out pages (login, register, guest share) honour the OS
          preference too. Blocking inline script on purpose, parsed before any
          content is painted — see lib/theme-mode.ts for the shared logic.
        */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
