'use client';
import React from 'react';
import Link from 'next/link';
import { Button } from '@heroui/react';
import { AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '@/components/ui/EmptyState';

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen flex items-center justify-center">
      <EmptyState
        icon={<AlertTriangle size={40} className="text-danger" />}
        title={t('errorPage.title')}
        description={t('errorPage.description')}
        action={
          <div className="flex gap-2">
            <Button color="primary" onPress={reset}>{t('errorPage.reload')}</Button>
            <Button as={Link} href="/" variant="bordered">{t('errorPage.backHome')}</Button>
          </div>
        }
      />
    </div>
  );
}
