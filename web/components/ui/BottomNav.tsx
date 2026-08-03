'use client';
import React, { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Button, Modal, ModalContent, ModalBody } from '@heroui/react';
import {
  Wine, Leaf, Warehouse, Library, BarChart3,
  Martini, ClipboardCheck, Wallet, MoreHorizontal,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useHasMounted } from '@/hooks/useHasMounted';

export function BottomNav() {
  const { t } = useTranslation();
  const pathname = usePathname();
  const router = useRouter();
  const hasMounted = useHasMounted();
  const [moreOpen, setMoreOpen] = useState(false);

  // Bottom nav is capped at 5 touch targets (UX convention). The 4 most
  // frequently used sections stay directly visible; the rest lives behind
  // a "More" sheet (see .vibe/ux-ui.md §5.4 — Modal menu on mobile when
  // items are numerous).
  const primaryLinks = [
    { label: t('nav.bottles'), href: '/bottles', icon: <Wine size={22} /> },
    { label: t('nav.cigars'), href: '/cigars', icon: <Leaf size={22} /> },
    { label: t('nav.caves'), href: '/cellars', icon: <Warehouse size={22} /> },
    { label: t('nav.collections'), href: '/collections', icon: <Library size={22} /> },
  ];

  const moreLinks = [
    { label: t('nav.tastings'), href: '/tastings', icon: <Martini size={20} /> },
    { label: t('nav.inventoryCount'), href: '/inventory-count', icon: <ClipboardCheck size={20} /> },
    { label: t('nav.wishlist'), href: '/wishlist', icon: <Wallet size={20} /> },
    { label: t('nav.analytics'), href: '/analytics', icon: <BarChart3 size={20} /> },
  ];

  const isMoreActive = moreLinks.some((link) => pathname.startsWith(link.href));

  const goTo = (href: string) => {
    setMoreOpen(false);
    router.push(href);
  };

  if (!hasMounted) return null;

  return (
    <>
      <div
        className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-content1 border-t border-divider"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex items-stretch justify-around h-16">
          {primaryLinks.map((link) => {
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
          <button
            onClick={() => setMoreOpen(true)}
            aria-label={t('nav.more')}
            aria-haspopup="true"
            aria-expanded={moreOpen}
            className={`flex flex-col items-center justify-center flex-1 gap-0.5 min-w-0 py-1 transition-colors ${
              isMoreActive ? 'text-primary' : 'text-default-400'
            }`}
          >
            <span className={isMoreActive ? 'text-primary' : 'text-default-400'}>
              <MoreHorizontal size={22} />
            </span>
            <span className="text-[0.55rem] font-semibold leading-tight truncate max-w-full px-1">
              {t('nav.more')}
            </span>
          </button>
        </div>
      </div>

      <Modal
        isOpen={moreOpen}
        onOpenChange={setMoreOpen}
        placement="bottom"
        radius="lg"
        backdrop="opaque"
        className="md:hidden"
        aria-label={t('nav.more')}
      >
        <ModalContent>
          <ModalBody className="py-4 gap-1">
            {moreLinks.map((link) => {
              const active = pathname.startsWith(link.href);
              return (
                <Button
                  key={link.href}
                  variant={active ? 'flat' : 'light'}
                  color={active ? 'primary' : 'default'}
                  radius="md"
                  className="w-full justify-start"
                  startContent={
                    <span className={active ? 'text-primary' : 'text-foreground-500'}>
                      {link.icon}
                    </span>
                  }
                  onPress={() => goTo(link.href)}
                >
                  {link.label}
                </Button>
              );
            })}
          </ModalBody>
        </ModalContent>
      </Modal>
    </>
  );
}
