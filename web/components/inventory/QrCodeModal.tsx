'use client';
import React, { useCallback } from 'react';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Button } from '@heroui/react';
import { QRCodeCanvas } from 'qrcode.react';
import { Download, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface QrCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  itemId: string;
  itemName: string;
}

export function QrCodeModal({ isOpen, onClose, itemId, itemName }: QrCodeModalProps) {
  const { t } = useTranslation('common');
  const appUrl = typeof window !== 'undefined' ? window.location.origin : '';
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
    <Modal isOpen={isOpen} onClose={onClose} size="sm" placement="center">
      <ModalContent>
        <ModalHeader className="flex items-center gap-2">
          <span className="text-base font-bold">{t('qr.title')}</span>
        </ModalHeader>
        <ModalBody className="flex flex-col items-center gap-4 py-4">
          <p className="text-sm text-foreground-500 text-center">{itemName}</p>
          <div className="p-4 bg-white rounded-2xl shadow-sm border border-default-100">
            <QRCodeCanvas
              id={`qr-canvas-${itemId}`}
              value={qrUrl}
              size={200}
              level="M"
              marginSize={1}
            />
          </div>
          <p className="text-[0.65rem] text-default-400 text-center break-all">{qrUrl}</p>
        </ModalBody>
        <ModalFooter className="gap-2">
          <Button variant="light" size="sm" onPress={onClose} startContent={<X size={14} />}>
            {t('actions.close')}
          </Button>
          <Button color="primary" size="sm" onPress={handleDownload} startContent={<Download size={14} />}>
            {t('qr.download')}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
