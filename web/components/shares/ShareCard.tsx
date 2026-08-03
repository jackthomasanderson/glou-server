'use client';
import React, { useState } from 'react';
import { Button, Chip } from '@heroui/react';
import { Copy, Check, Trash2, ExternalLink } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { format, parseISO } from 'date-fns';
import { GuestShare, getShareStatus } from '@/lib/shares/types';

interface ShareCardProps {
  share: GuestShare;
  onRevoke: (id: string) => void;
  isRevoking?: boolean;
}

const STATUS_COLOR = {
  active: 'success',
  expired: 'warning',
  revoked: 'danger',
} as const;

export function ShareCard({ share, onRevoke, isRevoking }: ShareCardProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const status = getShareStatus(share);

  const shareUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/guest/${share.token}`
      : `/guest/${share.token}`;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const scopeLabel = (() => {
    if (share.cellarIds.length > 0)
      return t('shares.cellarCount', { count: share.cellarIds.length });
    if (share.collectionIds.length > 0)
      return t('shares.collectionCount', { count: share.collectionIds.length });
    return t('shares.allCellars');
  })();

  return (
    <div className="bg-content1 border border-divider rounded-2xl p-4 flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate">
            {share.label ?? t('shares.guest.badge')}
          </p>
          {share.inviteeName && (
            <p className="text-xs text-primary truncate mt-0.5">
              {t('shares.inviteeLabel', { name: share.inviteeName })}
            </p>
          )}
          <p className="text-xs text-foreground-400 mt-0.5">{scopeLabel}</p>
        </div>
        <Chip color={STATUS_COLOR[status]} variant="flat" size="sm" className="shrink-0">
          {t(`shares.status${status.charAt(0).toUpperCase() + status.slice(1)}`)}
        </Chip>
      </div>

      {/* Meta */}
      <div className="flex flex-wrap gap-2 text-xs text-foreground-400">
        {share.expiresAt ? (
          <span>{t('shares.expiresAt', { date: format(parseISO(share.expiresAt), 'dd/MM/yyyy') })}</span>
        ) : (
          <span>{t('shares.noExpiry')}</span>
        )}
        {share.hidePrices && (
          <span className="text-warning-500">{t('shares.guest.pricesHidden')}</span>
        )}
        {share.hideNotes && (
          <span className="text-warning-500">{t('shares.guest.notesHidden')}</span>
        )}
        {share.writeCellarIds.length > 0 && (
          <span className="text-primary">
            {t('shares.writeAccessCount', { count: share.writeCellarIds.length })}
          </span>
        )}
      </div>

      {/* Actions */}
      {status === 'active' && (
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="flat"
            color="default"
            startContent={copied ? <Check size={13} /> : <Copy size={13} />}
            onPress={handleCopy}
            className="flex-1"
          >
            {copied ? t('shares.linkCopied') : t('shares.copyLink')}
          </Button>
          <Button
            size="sm"
            variant="flat"
            color="default"
            isIconOnly
            as="a"
            href={shareUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t('actions.view')}
          >
            <ExternalLink size={13} />
          </Button>
          <Button
            size="sm"
            variant="flat"
            color="danger"
            startContent={<Trash2 size={13} />}
            isLoading={isRevoking}
            onPress={() => onRevoke(share.id)}
            className="shrink-0"
          >
            {t('shares.revoke')}
          </Button>
        </div>
      )}
    </div>
  );
}
