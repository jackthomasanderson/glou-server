'use client';
import React, { useState } from 'react';
import { Button, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Skeleton } from '@heroui/react';
import { Monitor, MapPin, ShieldCheck, ShieldOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSessions, useRevokeSession, useTrustDevice, useUntrustDevice, SessionInfo } from '@/hooks/useAuth';
import { useHasMounted } from '@/hooks/useHasMounted';

export function SessionsPanel() {
  const { t } = useTranslation();
  const hasMounted = useHasMounted();

  const { data: sessions, isLoading, isError } = useSessions();
  const revokeSession = useRevokeSession();
  const trustDevice = useTrustDevice();
  const untrustDevice = useUntrustDevice();

  const [sessionToRevoke, setSessionToRevoke] = useState<SessionInfo | null>(null);
  const [trustMsg, setTrustMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleConfirmRevoke = () => {
    if (!sessionToRevoke) return;
    revokeSession.mutate(sessionToRevoke.id, {
      onSuccess: () => setSessionToRevoke(null),
      onError: () => setSessionToRevoke(null),
    });
  };

  const handleTrust = () => {
    setTrustMsg(null);
    trustDevice.mutate(undefined, {
      onSuccess: () => setTrustMsg({ type: 'success', text: t('profile.sessions.trustSuccess') }),
      onError: () => setTrustMsg({ type: 'error', text: t('profile.sessions.trustError') }),
    });
  };

  const handleUntrust = () => {
    setTrustMsg(null);
    untrustDevice.mutate(undefined, {
      onSuccess: () => setTrustMsg({ type: 'success', text: t('profile.sessions.untrustSuccess') }),
      onError: () => setTrustMsg({ type: 'error', text: t('profile.sessions.trustError') }),
    });
  };

  const formatDate = (value: string) => (hasMounted ? new Date(value).toLocaleString() : '');

  const formatLocation = (location: SessionInfo['location']) => {
    if (!location || (!location.city && !location.country)) return t('profile.sessions.unknownLocation');
    return [location.city, location.country].filter(Boolean).join(', ');
  };

  return (
    <div className="bg-content1 border border-divider rounded-2xl p-6 mt-6">
      <div className="flex items-center gap-3 mb-5">
        <Monitor size={20} className="text-primary" />
        <h2 className="text-base font-semibold">{t('profile.sessions.title')}</h2>
      </div>

      {isLoading && (
        <div className="flex flex-col gap-3">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="rounded-xl">
              <div className="h-16 rounded-xl bg-default-200" />
            </Skeleton>
          ))}
        </div>
      )}

      {!isLoading && isError && (
        <div className="bg-danger-50 border border-danger-200 text-danger text-sm rounded-lg px-4 py-3">
          {t('profile.sessions.loadError')}
        </div>
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
                  <p className="text-sm font-medium truncate">{session.device}</p>
                  {session.isCurrent && (
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-primary text-white shrink-0">
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
        </div>
      )}

      {/* Trust this device */}
      <div className="mt-5 pt-5 border-t border-divider">
        <p className="text-xs text-foreground-500 mb-3">{t('profile.sessions.trustDescription')}</p>
        {trustMsg && (
          <div
            className={`text-sm rounded-lg px-4 py-3 mb-3 border ${
              trustMsg.type === 'success'
                ? 'bg-success-50 border-success-200 text-success'
                : 'bg-danger-50 border-danger-200 text-danger'
            }`}
          >
            {trustMsg.text}
          </div>
        )}
        <div className="flex flex-wrap gap-3">
          <Button
            size="sm"
            variant="bordered"
            color="primary"
            startContent={<ShieldCheck size={16} />}
            onPress={handleTrust}
            isLoading={trustDevice.isPending}
            isDisabled={trustDevice.isPending}
          >
            {t('profile.sessions.trustDevice')}
          </Button>
          <Button
            size="sm"
            variant="light"
            color="danger"
            startContent={<ShieldOff size={16} />}
            onPress={handleUntrust}
            isLoading={untrustDevice.isPending}
            isDisabled={untrustDevice.isPending}
          >
            {t('profile.sessions.untrustDevice')}
          </Button>
        </div>
      </div>

      {/* Revoke confirmation modal */}
      <Modal isOpen={!!sessionToRevoke} onClose={() => setSessionToRevoke(null)} size="sm" radius="lg" backdrop="opaque" placement="center">
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>{t('profile.sessions.revokeConfirmTitle')}</ModalHeader>
              <ModalBody>
                <p className="text-sm text-foreground-600">{t('profile.sessions.revokeConfirmBody')}</p>
                {sessionToRevoke && (
                  <p className="text-sm font-medium mt-2">{sessionToRevoke.device}</p>
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
      </Modal>
    </div>
  );
}
