import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { Providers } from './providers';
import { THEME_INIT_SCRIPT } from '@/lib/theme-mode';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: 'Glou — Cellar manager · Gestionnaire de cave',
  description: 'Manage your wine, spirits and cigar cellar. Self-hosted, private. · Gérez votre cave à vin, spiritueux et cigares. Application auto-hébergée et privée.',
  // FEAT-16/23: PWA manifest — see web/public/manifest.json. Icons live in
  // public/icons/; app/icon.png, app/apple-icon.png and app/favicon.ico are
  // picked up by Next's file conventions.
  manifest: '/manifest.json',
};

export const viewport: Viewport = {
  // Matches the "Primaire" token from .vibe/ux-ui.md (light mode #2563EB /
  // dark mode #3B82F6) so the PWA install/OS chrome tint follows the theme.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#2563EB' },
    { media: '(prefers-color-scheme: dark)', color: '#3B82F6' },
  ],
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
