'use client';
import React, { useMemo, useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button, Avatar, Badge, Tooltip, Divider } from '@heroui/react';
import {
  Wine, Leaf, Warehouse, Library, Martini, BarChart3,
  ChevronLeft, ChevronRight, X, ShieldCheck,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useMe } from '@/hooks/useAuth';
import { useInventory } from '@/hooks/useInventory';
import { useCellars } from '@/hooks/useCellars';
import { useCollections } from '@/hooks/useCollections';
import { useHasMounted } from '@/hooks/useHasMounted';
import { ConnectivityIndicator } from './ConnectivityIndicator';

export const SIDEBAR_WIDTH = 220;
export const SIDEBAR_COLLAPSED_WIDTH = 64;

const STORAGE_KEY = 'glou-sidebar-expanded';

interface SidebarContentProps {
  expanded: boolean;
  onToggle: () => void;
}

function SidebarContent({ expanded, onToggle }: SidebarContentProps) {
  const { t } = useTranslation();
  const { data: user } = useMe();
  const { data: items } = useInventory();
  const { data: cellars } = useCellars();
  const { data: collections } = useCollections();
  const pathname = usePathname();
  const hasMounted = useHasMounted();

  const bottleCount = useMemo(
    () => items?.filter(i => ['wine', 'sparkling', 'spirit'].includes(i.category)).length ?? 0,
    [items]
  );
  const cigarCount = useMemo(
    () => items?.filter(i => i.category === 'cigar').length ?? 0,
    [items]
  );

  const navLinks = [
    { label: t('nav.bottles'), href: '/bottles', icon: <Wine size={18} />, count: bottleCount },
    { label: t('nav.cigars'), href: '/cigars', icon: <Leaf size={18} />, count: cigarCount },
    { label: t('nav.caves'), href: '/cellars', icon: <Warehouse size={18} />, count: cellars?.length ?? 0 },
    { label: t('nav.collections'), href: '/collections', icon: <Library size={18} />, count: collections?.length ?? 0 },
    { label: t('nav.tastings'), href: '/tastings', icon: <Martini size={18} />, count: 0 },
    { label: t('nav.analytics'), href: '/analytics', icon: <BarChart3 size={18} />, count: 0 },
  ];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Brand + toggle */}
      <div
        className={`flex items-start pt-5 pb-4 transition-all duration-200 ${
          expanded ? 'px-4 justify-between' : 'px-0 justify-center'
        }`}
      >
        <div
          className={`overflow-hidden transition-all duration-200 ${
            expanded ? 'max-w-[160px] opacity-100' : 'max-w-0 opacity-0'
          }`}
        >
          <Link
            href="/"
            className="block font-extrabold text-[1.1rem] tracking-[.15rem] text-secondary no-underline leading-tight whitespace-nowrap"
          >
            {user?.appName || 'GLOU'}
          </Link>
          <span className="block text-[0.6rem] tracking-[.08rem] uppercase text-foreground-500 mt-0.5 whitespace-nowrap">
            {user?.appSlogan || 'Simplement précieux'}
          </span>
        </div>

        <Tooltip
          content={expanded ? t('nav.collapse', 'Réduire') : t('nav.expand', 'Développer')}
          placement="right"
          delay={500}
        >
          <Button
            isIconOnly
            size="sm"
            variant="light"
            color="default"
            radius="md"
            onClick={onToggle}
            aria-label={expanded ? t('nav.collapse', 'Réduire') : t('nav.expand', 'Développer')}
          >
            {expanded ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
          </Button>
        </Tooltip>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 space-y-0.5">
        {navLinks.map((link) => {
          const active = pathname.startsWith(link.href);
          const showCount = hasMounted && link.count > 0;

          const btn = (
            <Button
              key={link.href}
              as={Link}
              href={link.href}
              variant={active ? 'flat' : 'light'}
              color={active ? 'primary' : 'default'}
              radius="md"
              className={`w-full transition-all duration-200 ${
                expanded
                  ? 'justify-start px-3 py-2'
                  : 'justify-center px-0 min-w-0'
              }`}
              startContent={
                !expanded && showCount ? (
                  <Badge content={link.count} color="primary" size="sm" isInvisible={active}>
                    <span className={active ? 'text-primary' : 'text-foreground-500'}>
                      {link.icon}
                    </span>
                  </Badge>
                ) : (
                  <span className={active ? 'text-primary' : 'text-foreground-500'}>
                    {link.icon}
                  </span>
                )
              }
              aria-label={link.label}
            >
              {expanded && (
                <span
                  className={`overflow-hidden transition-all duration-200 text-sm leading-normal whitespace-nowrap ${
                    expanded ? 'max-w-[200px] opacity-100' : 'max-w-0 opacity-0'
                  } ${active ? 'font-semibold' : 'font-normal'}`}
                >
                  {link.label}
                </span>
              )}
              {expanded && showCount && (
                <span className={`ml-auto text-[0.65rem] font-bold px-1.5 py-0.5 rounded-full leading-none ${
                  active ? 'bg-white/25 text-white' : 'bg-default-100 text-foreground-500'
                }`}>
                  {link.count}
                </span>
              )}
            </Button>
          );

          if (!expanded) {
            return (
              <Tooltip key={link.href} content={link.label} placement="right" delay={500}>
                {btn}
              </Tooltip>
            );
          }
          return btn;
        })}
      </nav>

      {/* Admin link */}
      {user?.isAdmin && (
        <div className="px-2 pb-1">
          <Divider className="mb-2" />
          {(() => {
            const active = pathname.startsWith('/admin');
            const btn = (
              <Button
                as={Link}
                href="/admin"
                variant={active ? 'flat' : 'light'}
                color={active ? 'primary' : 'default'}
                radius="md"
                className={`w-full transition-all duration-200 ${
                  expanded ? 'justify-start px-3 py-2' : 'justify-center px-0 min-w-0'
                }`}
                startContent={
                  <span className={active ? 'text-primary' : 'text-foreground-500'}>
                    <ShieldCheck size={18} />
                  </span>
                }
                aria-label={t('nav.admin')}
              >
                {expanded && (
                  <span className={`overflow-hidden transition-all duration-200 text-sm leading-normal whitespace-nowrap max-w-[200px] opacity-100 ${active ? 'font-semibold' : 'font-normal'}`}>
                    {t('nav.admin')}
                  </span>
                )}
              </Button>
            );
            if (!expanded) {
              return <Tooltip content={t('nav.admin')} placement="right" delay={500}>{btn}</Tooltip>;
            }
            return btn;
          })()}
        </div>
      )}

      {/* User footer */}
      <Divider />
      <Tooltip
        content={!expanded ? `${user?.username ?? ''} · ${user?.isAdmin ? t('nav.roleAdmin') : t('nav.roleUser')}` : ''}
        placement="right"
        isDisabled={expanded}
      >
        <div
          className={`flex items-center py-3 transition-all duration-200 ${
            expanded ? 'px-3 gap-2' : 'px-0 justify-center'
          }`}
        >
          <Avatar
            src={user?.avatarUrl || undefined}
            name={(!user?.avatarUrl && (user?.username || '?')[0].toUpperCase()) || undefined}
            size="sm"
            radius="full"
            isBordered
            color="secondary"
            className="flex-shrink-0 cursor-pointer"
            as={Link}
            href="/profile"
          />

          <div
            className={`overflow-hidden transition-all duration-200 flex-1 min-w-0 ${
              expanded ? 'max-w-[200px] opacity-100' : 'max-w-0 opacity-0'
            }`}
          >
            <p className="text-xs font-semibold leading-tight truncate whitespace-nowrap">
              {user?.username}
            </p>
            <p className="text-[0.65rem] text-foreground-500 leading-tight truncate whitespace-nowrap">
              {user?.isAdmin ? t('nav.roleAdmin') : t('nav.roleUser')}
            </p>
          </div>

          {expanded && <ConnectivityIndicator />}
        </div>
      </Tooltip>
    </div>
  );
}

interface SidebarProps {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export function Sidebar({ mobileOpen = false, onMobileClose = () => {} }: SidebarProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved !== null) setExpanded(saved !== 'false');
  }, []);

  const toggle = () => {
    const next = !expanded;
    setExpanded(next);
    localStorage.setItem(STORAGE_KEY, String(next));
  };

  const desktopWidth = expanded ? SIDEBAR_WIDTH : SIDEBAR_COLLAPSED_WIDTH;

  return (
    <>
      {/* Desktop: permanent sidebar */}
      <nav
        style={{ width: desktopWidth }}
        className="hidden md:flex flex-col flex-shrink-0 h-screen sticky top-0 bg-content1 border-r border-divider overflow-hidden z-20 transition-all duration-200"
      >
        <SidebarContent expanded={expanded} onToggle={toggle} />
      </nav>

      {/* Mobile: overlay drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={onMobileClose}
          />
          <div
            className="absolute left-0 top-0 bottom-0 bg-content1 border-r border-divider overflow-hidden"
            style={{ width: SIDEBAR_WIDTH }}
          >
            <Button
              isIconOnly
              size="sm"
              variant="light"
              radius="full"
              className="absolute top-3 right-3 z-10"
              onClick={onMobileClose}
              aria-label={t('actions.close')}
            >
              <X size={16} />
            </Button>
            <SidebarContent expanded={true} onToggle={onMobileClose} />
          </div>
        </div>
      )}
    </>
  );
}
