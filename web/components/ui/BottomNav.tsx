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
      <div className="flex items-center justify-around h-14">
        {navLinks.map((link) => {
          const active = pathname.startsWith(link.href);
          return (
            <Button
              key={link.href}
              isIconOnly
              variant="light"
              color={active ? 'primary' : 'default'}
              size="lg"
              radius="full"
              onClick={() => router.push(link.href)}
              aria-label={link.label}
            >
              {link.icon}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
