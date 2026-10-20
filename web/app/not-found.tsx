'use client';
import React from 'react';
import Link from 'next/link';
import { Button } from '@heroui/react';
import { SearchX } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '@/components/ui/EmptyState';

export default function NotFound() {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen flex items-center justify-center">
      <EmptyState
        icon={<SearchX size={40} className="text-foreground-400" />}
        title={t('errorPage.notFoundTitle')}
        description={t('errorPage.notFoundDescription')}
        action={<Button as={Link} href="/" color="primary">{t('errorPage.backHome')}</Button>}
      />
    </div>
  );
}
