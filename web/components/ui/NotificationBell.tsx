'use client';
import React, { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Button, Badge, Dropdown, DropdownTrigger, DropdownMenu, DropdownItem, DropdownSection, Chip, Tooltip,
} from '@heroui/react';
import { Bell, BellOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useInventory } from '@/hooks/useInventory';
import { useHasMounted } from '@/hooks/useHasMounted';
import { InventoryItem } from '@/lib/inventory/types';
import { useAlerts, useToggleAlertPause } from '@/hooks/useAlerts';
import { AlertBottle } from '@/lib/alerts/client';

const STATUS_COLOR: Record<string, 'danger' | 'success' | 'primary' | 'default'> = {
  past: 'danger',
  peak: 'success',
  approaching: 'primary',
};

type AlertEntry = { kind: 'alert'; id: string; alert: AlertBottle };
type ReminderEntry = { kind: 'reminder'; id: string; item: InventoryItem };
type NotificationEntry = AlertEntry | ReminderEntry;

export function NotificationBell() {
  const { t } = useTranslation();
  const { data: items } = useInventory();
  const { data: apogeeAlerts } = useAlerts();
  const togglePause = useToggleAlertPause();
  const router = useRouter();
  const hasMounted = useHasMounted();

  const reminderItems = useMemo(() => {
    if (!items || !hasMounted) return [];
    const today = new Date().toISOString().split('T')[0];
    return items.filter((b: InventoryItem) => b.reminderDate && b.reminderDate.split('T')[0] <= today);
  }, [items, hasMounted]);

  const alertItems: AlertBottle[] = useMemo(() => {
    if (!apogeeAlerts || !hasMounted) return [];
    return apogeeAlerts;
  }, [apogeeAlerts, hasMounted]);

  const count = reminderItems.length + alertItems.length;

  const entries: NotificationEntry[] = useMemo(() => [
    ...alertItems.slice(0, 5).map((a): AlertEntry => ({ kind: 'alert', id: `apogee-${a.id}`, alert: a })),
    ...reminderItems.slice(0, 5).map((r): ReminderEntry => ({ kind: 'reminder', id: `reminder-${r.id}`, item: r })),
  ], [alertItems, reminderItems]);

  const handleViewAll = () => router.push('/bottles?filter=alerts');

  // Avoid hydration mismatch — render plain button until mounted
  if (!hasMounted) {
    return (
      <Button isIconOnly size="sm" variant="light" radius="full" aria-label={t('inventory.alerts.title')}>
        <Bell size={18} />
      </Button>
    );
  }

  return (
    <Dropdown placement="bottom-end">
      <DropdownTrigger>
        <Button isIconOnly size="sm" variant="light" radius="full" aria-label={t('inventory.alerts.title')}>
          {count > 0 ? (
            <Badge content={count} color="danger" size="sm" placement="top-right">
              <Bell size={18} />
            </Badge>
          ) : (
            <Bell size={18} />
          )}
        </Button>
      </DropdownTrigger>
      <DropdownMenu
        aria-label={t('inventory.alerts.title')}
        variant="flat"
        className="w-80 max-h-96 overflow-y-auto"
      >
        {count === 0 ? (
          <DropdownSection>
            <DropdownItem key="empty" isDisabled>
              <span className="text-default-400 text-sm">{t('inventory.noNotifications', 'Aucune notification')}</span>
            </DropdownItem>
          </DropdownSection>
        ) : (
          <DropdownSection title={t('alerts.title')} showDivider items={entries}>
            {(entry) => entry.kind === 'alert' ? (
              <DropdownItem
                key={entry.id}
                onPress={handleViewAll}
                description={`${entry.alert.producer}${entry.alert.vintage ? ` · ${entry.alert.vintage}` : ''}${entry.alert.peakMaturityFrom ? ` · ${entry.alert.peakMaturityFrom}–${entry.alert.peakMaturityTo}` : ''}`}
                startContent={
                  <Chip size="sm" color={STATUS_COLOR[entry.alert.alertStatus ?? 'default'] ?? 'default'} variant="flat">
                    {t(`inventory.alertStatus.${entry.alert.alertStatus ?? 'none'}`)}
                  </Chip>
                }
                endContent={
                  <Tooltip content={entry.alert.alertsPaused ? t('alerts.resumeAlert') : t('alerts.pauseAlert')} delay={500}>
                    <Button
                      isIconOnly size="sm" variant="light"
                      color={entry.alert.alertsPaused ? 'default' : 'primary'}
                      onClick={(e) => { e.stopPropagation(); togglePause.mutate(entry.alert.id); }}
                      isDisabled={togglePause.isPending}
                      aria-label={entry.alert.alertsPaused ? t('alerts.resumeAlert') : t('alerts.pauseAlert')}
                    >
                      {entry.alert.alertsPaused ? <BellOff size={14} /> : <Bell size={14} />}
                    </Button>
                  </Tooltip>
                }
              >
                <span className="text-sm font-semibold">{entry.alert.name}</span>
              </DropdownItem>
            ) : (
              <DropdownItem
                key={entry.id}
                startContent={<Bell size={14} className="text-danger" />}
                description={entry.item.producer}
                onPress={handleViewAll}
              >
                <span className="text-sm font-semibold">{entry.item.name}</span>
              </DropdownItem>
            )}
          </DropdownSection>
        )}
        <DropdownSection>
          <DropdownItem
            key="view-all"
            className="text-primary font-bold text-center justify-center"
            onPress={handleViewAll}
          >
            {t('inventory.alerts.viewAll')}
          </DropdownItem>
        </DropdownSection>
      </DropdownMenu>
    </Dropdown>
  );
}
