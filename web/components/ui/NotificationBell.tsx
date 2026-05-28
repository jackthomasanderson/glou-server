'use client';
import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Button, Badge, Dropdown, DropdownTrigger, DropdownMenu, DropdownItem, DropdownSection,
} from '@heroui/react';
import { Bell } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useInventory } from '@/hooks/useInventory';
import { useHasMounted } from '@/hooks/useHasMounted';
import { InventoryItem } from '@/lib/inventory/types';

export function NotificationBell() {
  const { t } = useTranslation();
  const { data: items } = useInventory();
  const router = useRouter();
  const hasMounted = useHasMounted();

  const alertItems = useMemo(() => {
    if (!items || !hasMounted) return [];
    const today = new Date().toISOString().split('T')[0];
    return items.filter((b: InventoryItem) => b.reminderDate && b.reminderDate.split('T')[0] <= today);
  }, [items, hasMounted]);

  const count = alertItems.length;

  const handleViewAll = () => router.push('/inventory?filter=alerts');

  if (!hasMounted || count === 0) {
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
          <Badge content={count} color="danger" size="sm" placement="top-right">
            <Bell size={18} />
          </Badge>
        </Button>
      </DropdownTrigger>
      <DropdownMenu
        aria-label={t('inventory.alerts.title')}
        variant="flat"
        className="w-72 max-h-80 overflow-y-auto"
      >
        <DropdownSection title={t('inventory.alerts.title')} showDivider>
          {alertItems.slice(0, 5).map((item) => (
            <DropdownItem
              key={item.id}
              startContent={<Bell size={14} className="text-danger" />}
              description={item.producer}
              onPress={handleViewAll}
            >
              <span className="text-sm font-semibold">{item.name}</span>
            </DropdownItem>
          ))}
        </DropdownSection>
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
