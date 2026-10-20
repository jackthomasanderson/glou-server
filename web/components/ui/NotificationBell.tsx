'use client';
import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Badge, Chip, Popover, PopoverTrigger, PopoverContent } from '@heroui/react';
import { Bell, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useInventory, useUpdateInventoryItem } from '@/hooks/useInventory';
import { useHasMounted } from '@/hooks/useHasMounted';
import { InventoryItem } from '@/lib/inventory/types';
import { useAlerts, useToggleAlertPause } from '@/hooks/useAlerts';
import { useSidebarCounts } from '@/hooks/useSidebarCounts';
import { AlertBottle } from '@/lib/alerts/client';
import { todayLocalIso } from '@/lib/format';

const STATUS_COLOR: Record<string, 'danger' | 'success' | 'primary' | 'default'> = {
  past: 'danger',
  peak: 'success',
  approaching: 'primary',
};

// #506: only what calls for action now is counted in the badge. A bottle
// "approaching" its window (possibly 15 years ahead) is listed, not counted.
const ACTIONABLE = new Set(['past', 'peak']);
const STATUS_ORDER: Record<string, number> = { past: 0, peak: 1, approaching: 2 };

/** Opens the item's drawer on its own page (same `?scan=` deep link as QR codes). */
function itemHref(id: string, category: string): string {
  return `${category === 'cigar' ? '/cigars' : '/bottles'}?scan=${encodeURIComponent(id)}`;
}

export function NotificationBell() {
  const { t } = useTranslation();
  // #380: the badge count comes from the lightweight /stats/counts endpoint
  // (already mounted app-wide for the sidebar); the full inventory — up to
  // 2000 items — is only fetched once the panel is actually opened, to
  // build the detailed reminder list below.
  const [isOpen, setIsOpen] = useState(false);
  const { data: sidebarCounts } = useSidebarCounts();
  const { data: items } = useInventory({ enabled: isOpen });
  const { data: apogeeAlerts } = useAlerts();
  const togglePause = useToggleAlertPause();
  const updateItem = useUpdateInventoryItem();
  const router = useRouter();
  const hasMounted = useHasMounted();

  const reminderItems = useMemo(() => {
    if (!items || !hasMounted) return [];
    const today = todayLocalIso();
    return items.filter((b: InventoryItem) => b.reminderDate && b.reminderDate.split('T')[0] <= today);
  }, [items, hasMounted]);

  const alertItems: AlertBottle[] = useMemo(() => {
    if (!apogeeAlerts || !hasMounted) return [];
    return [...apogeeAlerts].sort(
      (a, b) => (STATUS_ORDER[a.alertStatus ?? ''] ?? 9) - (STATUS_ORDER[b.alertStatus ?? ''] ?? 9),
    );
  }, [apogeeAlerts, hasMounted]);

  const actionableAlerts = alertItems.filter((a) => ACTIONABLE.has(a.alertStatus ?? ''));
  const badgeCount = (sidebarCounts?.remindersToday ?? 0) + actionableAlerts.length;
  const count = isOpen ? reminderItems.length + actionableAlerts.length : badgeCount;

  const go = (href: string) => {
    setIsOpen(false);
    router.push(href);
  };

  // Avoid hydration mismatch — render plain button until mounted
  if (!hasMounted) {
    return (
      <Button isIconOnly size="sm" variant="light" radius="full" aria-label={t('inventory.alerts.title')}>
        <Bell size={18} />
      </Button>
    );
  }

  const isEmpty = alertItems.length === 0 && reminderItems.length === 0;

  // #506: a panel of real buttons (each row opens the bottle, its action is
  // a separate button reachable with Tab) instead of buttons nested inside
  // menu items, which the keyboard could not reach.
  return (
    <Popover placement="bottom-end" isOpen={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger>
        <Button isIconOnly size="sm" variant="light" radius="full" aria-label={t('inventory.alerts.title')} className="overflow-visible">
          {count > 0 ? (
            <Badge content={count} color="danger" size="sm" placement="top-right">
              <Bell size={18} />
            </Badge>
          ) : (
            <Bell size={18} />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0">
        <div className="w-full max-h-96 overflow-y-auto py-2" aria-label={t('inventory.alerts.title')}>
          {isEmpty ? (
            <p className="px-4 py-3 text-sm text-foreground-500">{t('inventory.noNotifications')}</p>
          ) : (
            <>
              <p className="px-4 pb-1 text-xs font-semibold text-foreground-500">{t('alerts.title')}</p>
              <ul className="flex flex-col">
                {alertItems.slice(0, 5).map((alert) => (
                  <li key={`apogee-${alert.id}`} className="flex items-center gap-1 px-2">
                    <button
                      type="button"
                      onClick={() => go(itemHref(alert.id, alert.category))}
                      className="flex-1 min-w-0 flex items-start gap-2 text-left rounded-lg px-2 py-2 hover:bg-default-100 focus-visible:outline-2 focus-visible:outline-primary"
                    >
                      <Chip size="sm" color={STATUS_COLOR[alert.alertStatus ?? 'default'] ?? 'default'} variant="flat" className="shrink-0">
                        {t(`inventory.alertStatus.${alert.alertStatus ?? 'none'}`)}
                      </Chip>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold truncate">{alert.name}</span>
                        <span className="block text-xs text-foreground-500 truncate">
                          {`${alert.producer}${alert.vintage ? ` · ${alert.vintage}` : ''}${alert.peakMaturityFrom ? ` · ${alert.peakMaturityFrom}–${alert.peakMaturityTo}` : ''}`}
                        </span>
                      </span>
                    </button>
                    <Button
                      isIconOnly size="sm" variant="light" color="primary"
                      onPress={() => togglePause.mutate(alert.id)}
                      isDisabled={togglePause.isPending}
                      aria-label={`${t('alerts.pauseAlert')} — ${alert.name}`}
                      title={t('alerts.pauseAlert')}
                    >
                      <Bell size={14} />
                    </Button>
                  </li>
                ))}
                {reminderItems.slice(0, 5).map((item) => (
                  <li key={`reminder-${item.id}`} className="flex items-center gap-1 px-2">
                    <button
                      type="button"
                      onClick={() => go(itemHref(item.id, item.category))}
                      className="flex-1 min-w-0 flex items-start gap-2 text-left rounded-lg px-2 py-2 hover:bg-default-100 focus-visible:outline-2 focus-visible:outline-primary"
                    >
                      <Bell size={14} className="text-danger shrink-0 mt-0.5" aria-hidden="true" />
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold truncate">{item.name}</span>
                        <span className="block text-xs text-foreground-500 truncate">{item.producer}</span>
                      </span>
                    </button>
                    <Button
                      isIconOnly size="sm" variant="light" color="success"
                      onPress={() => updateItem.mutate({ id: item.id, patch: { reminderDate: null } })}
                      isDisabled={updateItem.isPending}
                      aria-label={`${t('inventory.alerts.reminderDone')} — ${item.name}`}
                      title={t('inventory.alerts.reminderDone')}
                    >
                      <Check size={14} />
                    </Button>
                  </li>
                ))}
              </ul>
            </>
          )}
          <div className="border-t border-divider mt-1 pt-1 px-2">
            <button
              type="button"
              onClick={() => go('/bottles?filter=alerts')}
              className="w-full rounded-lg px-2 py-2 text-sm font-bold text-primary text-center hover:bg-default-100 focus-visible:outline-2 focus-visible:outline-primary"
            >
              {t('inventory.alerts.viewAll')}
            </button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
