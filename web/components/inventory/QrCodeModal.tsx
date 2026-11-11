'use client';
import React, { useCallback } from 'react';
import { ModalContent, ModalHeader, ModalBody, ModalFooter, Button, Spinner } from '@heroui/react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { QRCodeCanvas } from 'qrcode.react';
import { Download, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { usePublicUrl } from '@/hooks/useAppVersion';

interface QrCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  itemId: string;
  itemName: string;
}

export function QrCodeModal({ isOpen, onClose, itemId, itemName }: QrCodeModalProps) {
  const { t } = useTranslation('common');
  // #625: the configured public address, so a code made while browsing on
  // localhost still opens on a phone; without one (or offline), the
  // browser's own address, with a warning when that is localhost.
  const { data: publicUrl, isPending } = usePublicUrl();
  const appUrl = publicUrl ? publicUrl.replace(/\/+$/, '') : typeof window !== 'undefined' ? window.location.origin : '';
  const isLocalhost = !publicUrl && typeof window !== 'undefined' && ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);
  const qrUrl = `${appUrl}/bottles?scan=${itemId}`;

  const handleDownload = useCallback(() => {
    const canvas = document.getElementById(`qr-canvas-${itemId}`) as HTMLCanvasElement | null;
    if (!canvas) return;
    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/png');
    link.download = `qr-${itemName.replace(/\s+/g, '-').toLowerCase()}.png`;
    link.click();
  }, [itemId, itemName]);

  return (
    <ResponsiveModal isOpen={isOpen} onClose={onClose} size="sm" placement="center">
      <ModalContent>
        <ModalHeader className="flex items-center gap-2">
          <span className="text-base font-bold">{t('qr.title')}</span>
        </ModalHeader>
        <ModalBody className="flex flex-col items-center gap-4 py-4">
          <p className="text-sm text-foreground-500 text-center">{itemName}</p>
          {isPending ? (
            <div className="flex items-center justify-center w-[232px] h-[232px]">
              <Spinner size="md" aria-label={t('status.loading')} />
            </div>
          ) : (
            <>
              <div className="p-4 bg-white rounded-2xl shadow-sm border border-default-100">
                <QRCodeCanvas
                  id={`qr-canvas-${itemId}`}
                  value={qrUrl}
                  size={200}
                  level="M"
                  marginSize={1}
                />
              </div>
              <p className="text-xs text-foreground-500 text-center break-all">{qrUrl}</p>
            </>
          )}
          {!isPending && isLocalhost && (
            <p role="alert" className="text-xs text-warning text-center">{t('qr.localhostWarning')}</p>
          )}
        </ModalBody>
        <ModalFooter className="gap-2">
          <Button variant="light" size="sm" onPress={onClose} startContent={<X size={14} />}>
            {t('actions.close')}
          </Button>
          <Button color="primary" size="sm" onPress={handleDownload} isDisabled={isPending} startContent={<Download size={14} />}>
            {t('qr.download')}
          </Button>
        </ModalFooter>
      </ModalContent>
    </ResponsiveModal>
  );
}
