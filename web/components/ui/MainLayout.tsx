'use client';
import React, { useState } from 'react';
import { usePathname } from 'next/navigation';
import { Button } from '@heroui/react';
import { Menu } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Sidebar } from './Sidebar';
import { BottomNav } from './BottomNav';
import { GlobalSearch } from './GlobalSearch';
import { NotificationBell } from './NotificationBell';
import { AuthGuard } from '../auth/AuthGuard';
import { useMe } from '@/hooks/useAuth';

interface MainLayoutProps {
  children: React.ReactNode;
  protected?: boolean;
}

const PAGE_TITLES: Record<string, string> = {
  '/inventory': 'nav.bottles',
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
  return key ? t(PAGE_TITLES[key], key.slice(1)) : '';
}

export const MainLayout: React.FC<MainLayoutProps> = ({ children, protected: isProtected = true }) => {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { data: user } = useMe();
  const pageTitle = usePageTitle();

  const content = (
    <div className="flex min-h-screen bg-background">
      <Sidebar mobileOpen={drawerOpen} onMobileClose={() => setDrawerOpen(false)} />

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Content header */}
        <header className="sticky top-0 z-20 flex items-center gap-3 px-4 md:px-6 py-2.5 bg-content1 border-b border-divider">
          {/* Mobile hamburger */}
          <Button
            isIconOnly
            size="sm"
            variant="light"
            radius="full"
            onClick={() => setDrawerOpen(true)}
            aria-label="open navigation"
            className="md:hidden"
          >
            <Menu size={18} />
          </Button>

          {/* Breadcrumb */}
          <span className="text-[0.65rem] font-bold tracking-[.1rem] uppercase text-foreground-500 whitespace-nowrap">
            {user?.appName || 'Glou'}
            {pageTitle && (
              <span className="text-foreground"> &gt; {pageTitle}</span>
            )}
          </span>

          <div className="flex-1" />
          <GlobalSearch />
          <NotificationBell />
        </header>

        {/* Page content */}
        <main className="flex-1 pb-14 md:pb-0">
          {children}
        </main>
      </div>

      <BottomNav />
    </div>
  );

  if (isProtected) return <AuthGuard>{content}</AuthGuard>;
  return content;
};
