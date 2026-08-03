'use client';
import React, { useState } from 'react';
import {
  Button,
  Card,
  CardBody,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Spinner,
} from '@heroui/react';
import { Link2, Plus, Copy, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useShares, useCreateShare, useRevokeShare } from '@/hooks/useShares';
import { CreatedGuestShare, ShareFormValues } from '@/lib/shares/types';
import { ShareCard } from './ShareCard';
import { ShareForm } from './ShareForm';

export function SharesDashboard() {
  const { t } = useTranslation();
  const { data: shares, isLoading, isError } = useShares();
  const createMutation = useCreateShare();
  const revokeMutation = useRevokeShare();
  const [formOpen, setFormOpen] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  // The raw token is only ever known once, right after creation (only its
  // hash is persisted server-side — security fix) — held here just long
  // enough to show the "copy it now" panel below.
  const [createdShare, setCreatedShare] = useState<CreatedGuestShare | null>(null);
  const [copied, setCopied] = useState(false);

  const handleCreate = async (values: ShareFormValues) => {
    const created = await createMutation.mutateAsync(values);
    setFormOpen(false);
    setCreatedShare(created);
  };

  const shareUrl = createdShare
    ? typeof window !== 'undefined'
      ? `${window.location.origin}/guest/${createdShare.token}`
      : `/guest/${createdShare.token}`
    : '';

  const handleCopyCreatedLink = async () => {
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const closeCreatedModal = () => {
    setCreatedShare(null);
    setCopied(false);
  };

  const handleRevoke = async (id: string) => {
    setRevokingId(id);
    try {
      await revokeMutation.mutateAsync(id);
    } finally {
      setRevokingId(null);
    }
  };

  return (
    <>
      <Card className="border border-default-200" shadow="none">
        <CardBody className="p-5 flex flex-col gap-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Link2 size={18} className="text-primary" />
              <h3 className="text-sm font-bold">{t('shares.title')}</h3>
            </div>
            <Button
              size="sm"
              color="primary"
              variant="flat"
              startContent={<Plus size={14} />}
              onPress={() => setFormOpen(true)}
            >
              {t('shares.create')}
            </Button>
          </div>

          <p className="text-xs text-foreground-400">{t('shares.subtitle')}</p>

          {/* Error */}
          {isError && (
            <div className="rounded-lg bg-danger-50 border border-danger-200 text-danger px-3 py-2 text-xs">
              {t('shares.errors.load')}
            </div>
          )}

          {/* Loading */}
          {isLoading ? (
            <div className="flex justify-center py-6">
              <Spinner size="md" />
            </div>
          ) : !shares?.length ? (
            <div className="text-center py-6">
              <Link2 size={36} className="text-default-200 mx-auto mb-2" />
              <p className="text-sm text-default-400">{t('shares.empty')}</p>
              <p className="text-xs text-default-300 mt-1">{t('shares.emptyHint')}</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {shares.map((share) => (
                <ShareCard
                  key={share.id}
                  share={share}
                  onRevoke={handleRevoke}
                  isRevoking={revokingId === share.id}
                />
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      {/* Create modal */}
      <Modal
        isOpen={formOpen}
        onClose={() => setFormOpen(false)}
        size="sm"
        placement="center"
        scrollBehavior="inside"
      >
        <ModalContent>
          <ModalHeader>{t('shares.create')}</ModalHeader>
          <ModalBody className="pb-6">
            <ShareForm
              onSubmit={handleCreate}
              onCancel={() => setFormOpen(false)}
              isLoading={createMutation.isPending}
            />
          </ModalBody>
        </ModalContent>
      </Modal>

      {/* Post-creation modal — the ONLY moment the raw link is ever shown. */}
      <Modal isOpen={!!createdShare} onClose={closeCreatedModal} size="sm" placement="center">
        <ModalContent>
          <ModalHeader>{t('shares.createdModal.title')}</ModalHeader>
          <ModalBody>
            <p className="text-sm text-warning-600">{t('shares.createdModal.warning')}</p>
            <div className="rounded-lg bg-content2 border border-divider px-3 py-2 text-xs break-all font-mono">
              {shareUrl}
            </div>
          </ModalBody>
          <ModalFooter>
            <Button
              size="sm"
              variant="flat"
              color="default"
              startContent={copied ? <Check size={13} /> : <Copy size={13} />}
              onPress={handleCopyCreatedLink}
              className="flex-1"
            >
              {copied ? t('shares.linkCopied') : t('shares.copyLink')}
            </Button>
            <Button size="sm" color="primary" onPress={closeCreatedModal}>
              {t('shares.createdModal.done')}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
}
