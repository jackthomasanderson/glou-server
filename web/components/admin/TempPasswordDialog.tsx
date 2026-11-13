'use client';
import { useState } from 'react';
import { Button, ModalContent, ModalHeader, ModalBody, ModalFooter } from '@heroui/react';
import { Check, Copy } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { copyText } from '@/lib/clipboard';

interface TempPasswordDialogProps {
  /** The member's new temporary password, shown once; the dialog is open while this is set. */
  result: { username: string; tempPassword: string } | null;
  onClose: () => void;
}

/**
 * #336: the one-time display of the temporary password of an admin reset.
 * Copied through lib/clipboard, which also works over plain HTTP, and says
 * when the browser refuses every way to copy (#887).
 */
export function TempPasswordDialog({ result, onClose }: TempPasswordDialogProps) {
  const { t } = useTranslation();
  const [copy, setCopy] = useState<'idle' | 'copied' | 'failed'>('idle');

  const handleCopy = async () => {
    if (!result) return;
    setCopy((await copyText(result.tempPassword)) ? 'copied' : 'failed');
  };

  const handleClose = () => {
    setCopy('idle');
    onClose();
  };

  return (
    <ResponsiveModal
      isOpen={!!result}
      onClose={handleClose}
      size="sm" radius="lg" backdrop="opaque" placement="center"
    >
      <ModalContent>
        {(close) => (
          <>
            <ModalHeader>{t('admin.users.resetPasswordResultTitle', { username: result?.username })}</ModalHeader>
            <ModalBody className="flex flex-col gap-3">
              <p className="text-sm text-foreground-500">{t('admin.users.resetPasswordResultHint')}</p>
              <div className="flex items-center gap-2 bg-default-100 rounded-lg px-3 py-2">
                <code className="text-sm font-mono font-bold flex-1 select-all">{result?.tempPassword}</code>
                <Button isIconOnly size="sm" variant="light" aria-label={t('actions.copy')} onPress={() => { void handleCopy(); }}>
                  {copy === 'copied' ? <Check size={16} className="text-success" /> : <Copy size={16} />}
                </Button>
              </div>
              {copy === 'failed' && (
                <p role="alert" className="text-sm text-danger">{t('admin.users.resetPasswordCopyFailed')}</p>
              )}
            </ModalBody>
            <ModalFooter>
              <Button color="primary" variant="solid" onPress={close}>{t('actions.close')}</Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </ResponsiveModal>
  );
}
