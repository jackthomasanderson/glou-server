'use client';
import React, { useState } from 'react';
import { Button, Card, CardBody, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from '@heroui/react';
import { Download, Trash2, RotateCcw, ShieldAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useExportData, useRequestAccountDeletion, useCancelAccountDeletion, PublicUser } from '@/hooks/useAuth';
import { addDays, format, parseISO } from 'date-fns';

interface GdprSectionProps {
  user: PublicUser;
}

export function GdprSection({ user }: GdprSectionProps) {
  const { t } = useTranslation('common');
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  const exportMutation = useExportData();
  const deleteMutation = useRequestAccountDeletion();
  const cancelMutation = useCancelAccountDeletion();

  const isDeletionPending = !!user.deletionRequestedAt;
  const deletionDeadline = isDeletionPending
    ? format(addDays(parseISO(user.deletionRequestedAt!), 30), 'dd/MM/yyyy')
    : null;

  const handleConfirmDelete = () => {
    if (confirmText !== t('gdpr.deleteKeyword')) return;
    deleteMutation.mutate(undefined, { onSuccess: () => { setDeleteModalOpen(false); setConfirmText(''); } });
  };

  return (
    <>
      <Card className="border border-default-200" shadow="none">
        <CardBody className="p-5 flex flex-col gap-5">
          <div className="flex items-center gap-2">
            <ShieldAlert size={18} className="text-primary" />
            <h3 className="text-sm font-bold">{t('gdpr.title')}</h3>
          </div>

          {/* Deletion pending banner */}
          {isDeletionPending && (
            <div className="flex items-start gap-3 bg-warning-50 border border-warning-200 rounded-xl p-4">
              <ShieldAlert size={16} className="text-warning mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-warning-700">{t('gdpr.deletionPending')}</p>
                <p className="text-xs text-warning-600 mt-0.5">
                  {t('gdpr.deletionDeadline', { date: deletionDeadline })}
                </p>
              </div>
              <Button
                size="sm"
                variant="flat"
                color="warning"
                isLoading={cancelMutation.isPending}
                startContent={<RotateCcw size={14} />}
                onPress={() => cancelMutation.mutate()}
              >
                {t('gdpr.cancelDeletion')}
              </Button>
            </div>
          )}

          {/* Export */}
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-semibold">{t('gdpr.exportTitle')}</p>
              <p className="text-xs text-default-400 mt-0.5">{t('gdpr.exportDescription')}</p>
            </div>
            <Button
              size="sm"
              variant="flat"
              color="default"
              isLoading={exportMutation.isPending}
              startContent={<Download size={14} />}
              onPress={() => exportMutation.mutate()}
              className="shrink-0"
            >
              {t('gdpr.exportButton')}
            </Button>
          </div>

          {/* Delete account */}
          {!isDeletionPending && (
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-danger">{t('gdpr.deleteTitle')}</p>
                <p className="text-xs text-default-400 mt-0.5">{t('gdpr.deleteDescription')}</p>
              </div>
              <Button
                size="sm"
                variant="flat"
                color="danger"
                startContent={<Trash2 size={14} />}
                onPress={() => setDeleteModalOpen(true)}
                className="shrink-0"
              >
                {t('gdpr.deleteButton')}
              </Button>
            </div>
          )}
        </CardBody>
      </Card>

      {/* Confirmation modal */}
      <Modal isOpen={deleteModalOpen} onClose={() => { setDeleteModalOpen(false); setConfirmText(''); }} size="sm" placement="center">
        <ModalContent>
          <ModalHeader className="text-danger">{t('gdpr.deleteModalTitle')}</ModalHeader>
          <ModalBody className="flex flex-col gap-4">
            <p className="text-sm text-foreground-600">{t('gdpr.deleteModalBody')}</p>
            <p className="text-xs text-default-400">{t('gdpr.deleteModalHint', { keyword: t('gdpr.deleteKeyword') })}</p>
            <input
              className="w-full border border-divider rounded-lg px-3 py-2 text-sm bg-transparent outline-none focus:border-danger"
              placeholder={t('gdpr.deleteKeyword')}
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
            />
          </ModalBody>
          <ModalFooter className="gap-2">
            <Button variant="light" size="sm" onPress={() => { setDeleteModalOpen(false); setConfirmText(''); }}>
              {t('actions.cancel')}
            </Button>
            <Button
              color="danger"
              size="sm"
              isLoading={deleteMutation.isPending}
              isDisabled={confirmText !== t('gdpr.deleteKeyword')}
              onPress={handleConfirmDelete}
            >
              {t('gdpr.deleteConfirm')}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
}
