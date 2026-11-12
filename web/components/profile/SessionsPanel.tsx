'use client';
import React, { useState } from 'react';
import { LoadingRegion } from '@/components/ui/LoadingRegion';
import { Button, ModalContent, ModalHeader, ModalBody, ModalFooter, Skeleton } from '@heroui/react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Monitor, MapPin } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSessions, useRevokeSession, SessionInfo } from '@/hooks/useAuth';
import { useHasMounted } from '@/hooks/useHasMounted';
import { ErrorState } from '@/components/ui/ErrorState';
import { formatDateTime, formatDeviceLabel } from '@/lib/format';

export function SessionsPanel() {
  const { t, i18n } = useTranslation();
  const hasMounted = useHasMounted();

  const { data: sessions, isLoading, isError, error: queryError, refetch, isRefetching } = useSessions();
  const revokeSession = useRevokeSession();

  const [sessionToRevoke, setSessionToRevoke] = useState<SessionInfo | null>(null);

  const handleConfirmRevoke = () => {
    if (!sessionToRevoke) return;
    revokeSession.mutate(sessionToRevoke.id, {
      onSuccess: () => setSessionToRevoke(null),
      onError: () => setSessionToRevoke(null),
    });
  };

  const formatDate = (value: string) => (hasMounted ? formatDateTime(value, i18n.language) : '');

  const formatLocation = (location: SessionInfo['location']) => {
    if (!location || (!location.city && !location.country)) return t('profile.sessions.unknownLocation');
    return [location.city, location.country].filter(Boolean).join(', ');
  };

  const formatDevice = (device: SessionInfo['device']) => formatDeviceLabel(device, t);

  return (
    <div className="bg-content1 border border-divider rounded-2xl p-6">
      <div className="flex items-center gap-3 mb-5">
        <Monitor size={20} className="text-primary" />
        <h2 className="text-base font-semibold">{t('profile.sessions.title')}</h2>
      </div>

      {isLoading && (
        <LoadingRegion className="flex flex-col gap-3">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="rounded-xl">
              <div className="h-16 rounded-xl bg-default-200" />
            </Skeleton>
          ))}
        </LoadingRegion>
      )}

      {!isLoading && isError && (
        <ErrorState
          error={queryError}
          message={t('profile.sessions.loadError')}
          onRetry={() => { void refetch(); }}
          isRetrying={isRefetching}
        />
      )}

      {!isLoading && !isError && sessions && sessions.length === 0 && (
        <p className="text-sm text-foreground-500">{t('profile.sessions.empty')}</p>
      )}

      {!isLoading && !isError && sessions && sessions.length > 0 && (
        <div className="flex flex-col gap-3">
          {sessions.map((session) => (
            <div key={session.id} className="flex items-center justify-between gap-3 p-3 bg-default-50 rounded-xl">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium truncate">{formatDevice(session.device)}</p>
                  {session.isCurrent && (
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-primary text-primary-foreground shrink-0">
                      {t('profile.sessions.current')}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1 text-xs text-foreground-500 mt-1">
                  <MapPin size={12} />
                  <span className="truncate">{formatLocation(session.location)}</span>
                </div>
                <p className="text-xs text-foreground-400 mt-0.5">
                  {t('profile.sessions.lastActive')} : {formatDate(session.lastActiveAt)}
                </p>
              </div>
              {!session.isCurrent && (
                <Button
                  size="sm"
                  variant="light"
                  color="danger"
                  className="shrink-0"
                  onPress={() => setSessionToRevoke(session)}
                >
                  {t('profile.sessions.revoke')}
                </Button>
              )}
            </div>
          ))}
          {/* #434: the DB-IP Lite licence asks for a link back where locations are shown. */}
          <p className="text-xs text-foreground-400">
            <a href="https://db-ip.com" target="_blank" rel="noopener noreferrer" className="hover:underline">
              {t('profile.sessions.geoCredit')}
            </a>
          </p>
        </div>
      )}

      {/* Revoke confirmation modal */}
      <ResponsiveModal isOpen={!!sessionToRevoke} onClose={() => setSessionToRevoke(null)} size="sm" radius="lg" backdrop="opaque" placement="center">
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>{t('profile.sessions.revokeConfirmTitle')}</ModalHeader>
              <ModalBody>
                <p className="text-sm text-foreground-600">{t('profile.sessions.revokeConfirmBody')}</p>
                {sessionToRevoke && (
                  <p className="text-sm font-medium mt-2">{formatDevice(sessionToRevoke.device)}</p>
                )}
              </ModalBody>
              <ModalFooter>
                <Button color="danger" variant="light" onPress={onClose} isDisabled={revokeSession.isPending}>
                  {t('actions.cancel')}
                </Button>
                <Button
                  color="danger"
                  variant="solid"
                  onPress={handleConfirmRevoke}
                  isLoading={revokeSession.isPending}
                  isDisabled={revokeSession.isPending}
                >
                  {t('profile.sessions.revoke')}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </ResponsiveModal>

    </div>
  );
}
