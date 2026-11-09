'use client';
import React from 'react';
import { Button, Skeleton, ModalContent, ModalHeader, ModalBody, ModalFooter } from '@heroui/react';
import { Link2, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { useAdminShares, useRevokeAdminShare, type AdminGuestShare } from '@/hooks/useAdmin';
import { useHasMounted } from '@/hooks/useHasMounted';
import { formatDate } from '@/lib/format';

/**
 * #486: every member's guest links still in force, for the admin — who made
 * each, for whom, what it opens and until when — with a Revoke button. The
 * link itself is never known here: only its hash is stored.
 */
export function AdminSharesSection() {
  const { t, i18n } = useTranslation();
  const hasMounted = useHasMounted();
  const { data: shares, isLoading, isError } = useAdminShares();
  const { mutate: revoke, isPending: isRevoking } = useRevokeAdminShare();
  const [target, setTarget] = React.useState<AdminGuestShare | null>(null);

  const title = (share: AdminGuestShare) => share.label || share.inviteeName || t('admin.shares.unnamed');
  const ownerName = (share: AdminGuestShare) => share.owner.displayName || share.owner.username || '—';
  const date = (value: string | Date) => (hasMounted ? formatDate(value, i18n.language) : '');

  const scope = (share: AdminGuestShare) => {
    const parts = [
      share.cellarCount > 0 && t('shares.cellarCount', { count: share.cellarCount }),
      share.collectionCount > 0 && t('shares.collectionCount', { count: share.collectionCount }),
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(' · ') : t('shares.allCellars');
  };

  const confirmRevoke = () => {
    if (!target) return;
    revoke(target.id, { onSettled: () => setTarget(null) });
  };

  return (
    <div className="bg-content1 border border-divider rounded-2xl p-4 sm:p-6">
      <h2 className="text-base font-semibold mb-1 flex items-center gap-2">
        <Link2 size={16} aria-hidden="true" /> {t('admin.shares.title')}
      </h2>
      <p className="text-sm text-foreground-500 mb-4">{t('admin.shares.subtitle')}</p>

      {isLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)}
        </div>
      ) : isError ? (
        <p role="alert" className="text-sm text-danger">{t('admin.shares.loadError')}</p>
      ) : !shares?.length ? (
        <p className="text-center py-6 text-sm text-foreground-500">{t('admin.shares.empty')}</p>
      ) : (
        <ul className="grid grid-cols-1 lg:grid-cols-2 gap-3" aria-label={t('admin.shares.title')}>
          {shares.map((share) => (
            <li key={share.id} className="border border-divider rounded-xl p-4 flex flex-col gap-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold break-words">{title(share)}</p>
                {share.inviteeName && (
                  <p className="text-sm text-foreground-500 break-words">{t('shares.inviteeLabel', { name: share.inviteeName })}</p>
                )}
                <p className="text-sm text-foreground-500">{t('admin.shares.owner', { name: ownerName(share) })}</p>
                {!share.owner.isActive && (
                  <p className="text-sm text-warning-700 mt-1">{t('admin.shares.ownerDeactivated')}</p>
                )}
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-foreground-500">
                <span>{scope(share)}</span>
                {share.writeCellarCount > 0 && (
                  <span className="text-warning-700">{t('shares.writeAccessCount', { count: share.writeCellarCount })}</span>
                )}
                <span>{share.expiresAt ? t('shares.expiresAt', { date: date(share.expiresAt) }) : t('shares.noExpiry')}</span>
                {share.hidePrices && <span>{t('shares.guest.pricesHidden')}</span>}
                {share.hideNotes && <span>{t('shares.guest.notesHidden')}</span>}
                <span>{t('admin.shares.createdAt', { date: date(share.createdAt) })}</span>
              </div>
              <div>
                <Button size="md" variant="flat" color="danger" startContent={<Trash2 size={14} />} onPress={() => setTarget(share)}>
                  {t('shares.revoke')}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <ResponsiveModal isOpen={!!target} onClose={() => !isRevoking && setTarget(null)} size="sm" radius="lg" backdrop="opaque" placement="center">
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>{t('admin.shares.revokeTitle')}</ModalHeader>
              <ModalBody>
                <p className="text-sm">
                  {target && t('admin.shares.revokeBody', { label: title(target), owner: ownerName(target) })}
                </p>
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose} isDisabled={isRevoking}>{t('actions.cancel')}</Button>
                <Button color="danger" variant="solid" onPress={confirmRevoke} isLoading={isRevoking}>{t('shares.revoke')}</Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </ResponsiveModal>
    </div>
  );
}
