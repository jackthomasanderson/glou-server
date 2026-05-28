'use client';
import React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Button } from '@heroui/react';
import { Wine, Leaf, Warehouse, Library, BarChart3 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useHasMounted } from '@/hooks/useHasMounted';

export function BottomNav() {
  const { t } = useTranslation();
  const pathname = usePathname();
  const router = useRouter();
  const hasMounted = useHasMounted();

  const navLinks = [
    { label: t('nav.bottles'), href: '/bottles', icon: <Wine size={22} /> },
    { label: t('nav.cigars'), href: '/cigars', icon: <Leaf size={22} /> },
    { label: t('nav.caves'), href: '/cellars', icon: <Warehouse size={22} /> },
    { label: t('nav.collections'), href: '/collections', icon: <Library size={22} /> },
    { label: t('nav.analytics'), href: '/analytics', icon: <BarChart3 size={22} /> },
  ];

  if (!hasMounted) return null;

  return (
    <div
      className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-content1 border-t border-divider"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex items-stretch justify-around h-16">
        {navLinks.map((link) => {
          const active = pathname.startsWith(link.href);
          return (
            <button
              key={link.href}
              onClick={() => router.push(link.href)}
              aria-label={link.label}
              className={`flex flex-col items-center justify-center flex-1 gap-0.5 min-w-0 py-1 transition-colors ${
                active ? 'text-primary' : 'text-default-400'
              }`}
            >
              <span className={active ? 'text-primary' : 'text-default-400'}>
                {link.icon}
              </span>
              <span className="text-[0.55rem] font-semibold leading-tight truncate max-w-full px-1">
                {link.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
