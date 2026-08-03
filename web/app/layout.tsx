import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { Providers } from './providers';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: 'Glou — Gestionnaire de Cave',
  description: 'Gérez votre cave à vin, spiritueux et cigares. Application self-hosted, souveraine et privée.',
  // FEAT-16/23: PWA manifest — see web/public/manifest.json. No app icons
  // exist in the repo yet (public/ only holds locales/), so the manifest has
  // no `icons` entry; the browser install prompt/criteria will stay
  // incomplete until real icon assets are supplied — documented, not faked.
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
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
