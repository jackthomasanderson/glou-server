'use client';
import React, { useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { Avatar, Button, Tooltip } from '@heroui/react';
import { Search, Lock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Sidebar } from './Sidebar';
import { BottomNav } from './BottomNav';
import { GlobalSearch, MobileSearch } from './GlobalSearch';
import { NotificationBell } from './NotificationBell';
import { AuthGuard } from '../auth/AuthGuard';
import { useMe } from '@/hooks/useAuth';
import { useAutoLock } from '@/hooks/useAutoLock';

interface MainLayoutProps {
  children: React.ReactNode;
  protected?: boolean;
}

const PAGE_TITLES: Record<string, string> = {
  '/bottles': 'nav.bottles',
  '/cigars': 'nav.cigars',
  '/cellars': 'nav.caves',
  '/collections': 'nav.collections',
  '/tastings': 'nav.tastings',
  '/analytics': 'nav.analytics',
  '/profile': 'nav.profile',
  '/admin': 'nav.admin',
};

function usePageTitle() {
  const pathname = usePathname();
  const { t } = useTranslation();
  const key = Object.keys(PAGE_TITLES).find(k => pathname.startsWith(k));
  return key ? { label: t(PAGE_TITLES[key], key.slice(1)), href: key } : null;
}

/**
 * FEAT-30: quick-lock button, accessible from any screen. Only rendered when
 * `MainLayout` is protected (wrapped by `AuthGuard`/`AutoLockProvider`) —
 * `useAutoLock` requires that provider to be mounted above it.
 */
function QuickLockButton() {
  const { t } = useTranslation();
  const { lockNow } = useAutoLock();
  return (
    <Tooltip content={t('lock.buttonLabel')} placement="bottom" delay={500}>
      <Button
        isIconOnly
        size="sm"
        variant="light"
        color="default"
        radius="full"
        onPress={lockNow}
        aria-label={t('lock.buttonLabel')}
      >
        <Lock size={18} />
      </Button>
    </Tooltip>
  );
}

export const MainLayout: React.FC<MainLayoutProps> = ({ children, protected: isProtected = true }) => {
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const { data: user } = useMe();
  const pageTitle = usePageTitle();
  const pathname = usePathname();

  const content = (
    <div className="flex min-h-screen bg-background">
      <Sidebar />

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Content header */}
        <header className="sticky top-0 z-20 flex items-center gap-3 px-4 md:px-6 py-2.5 bg-content1 border-b border-divider">
          {/* Breadcrumb */}
          <span className="text-[0.65rem] font-bold tracking-[.1rem] uppercase whitespace-nowrap flex items-center gap-1">
            <Link href="/" className="text-foreground-500 hover:text-foreground transition-colors">
              {user?.appName || 'Glou'}
            </Link>
            {pageTitle && (
              <>
                <span className="text-foreground-400">&gt;</span>
                {pageTitle.href !== pathname ? (
                  <Link href={pageTitle.href} className="text-foreground-500 hover:text-foreground transition-colors">
                    {pageTitle.label}
                  </Link>
                ) : (
                  <span className="text-foreground">{pageTitle.label}</span>
                )}
              </>
            )}
          </span>

          <div className="flex-1" />
          <GlobalSearch />
          {/* Mobile search trigger */}
          <Button
            isIconOnly
            size="sm"
            variant="light"
            radius="full"
            onClick={() => setMobileSearchOpen(true)}
            aria-label="open search"
            className="sm:hidden"
          >
            <Search size={18} />
          </Button>
          {isProtected && <QuickLockButton />}
          <NotificationBell />
          {/* Mobile: quick profile access */}
          <Avatar
            as={Link}
            href="/profile"
            src={user?.avatarUrl || undefined}
            name={(!user?.avatarUrl && (user?.username || '?')[0].toUpperCase()) || undefined}
            size="sm"
            radius="full"
            isBordered
            color="secondary"
            className="md:hidden shrink-0 cursor-pointer"
          />
        </header>

        {/* Page content */}
        <main className="flex-1 pb-16 md:pb-0">
          {children}
        </main>
      </div>

      <BottomNav />
      <MobileSearch isOpen={mobileSearchOpen} onClose={() => setMobileSearchOpen(false)} />
    </div>
  );

  if (isProtected) return <AuthGuard>{content}</AuthGuard>;
  return content;
};
