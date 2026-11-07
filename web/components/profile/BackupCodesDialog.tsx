'use client';
import { useState } from 'react';
import { Button, Checkbox, ModalContent, ModalHeader, ModalBody, ModalFooter } from '@heroui/react';
import { Check, Copy } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { copyText } from '@/lib/clipboard';

interface BackupCodesDialogProps {
  /** The codes to show once; the dialog is open while this is set. */
  codes: string[] | null;
  /** What just happened (2FA turned on, codes regenerated). */
  successMessage: string;
  onDone: () => void;
}

/**
 * #638: the one and only display of the backup codes. They used to sit in a
 * dialog that Escape closed for good, with no way to copy them. Now there is
 * a Copy button, and nothing (Escape, backdrop, close button) dismisses the
 * dialog until the member ticks "I have saved my codes".
 */
export function BackupCodesDialog({ codes, successMessage, onDone }: BackupCodesDialogProps) {
  const { t } = useTranslation();
  const [saved, setSaved] = useState(false);
  const [copy, setCopy] = useState<'idle' | 'copied' | 'failed'>('idle');

  const handleCopy = async () => {
    if (!codes) return;
    setCopy((await copyText(codes.join('\n'))) ? 'copied' : 'failed');
  };

  const handleDone = () => {
    if (!saved) return;
    setSaved(false);
    setCopy('idle');
    onDone();
  };

  return (
    <ResponsiveModal
      isOpen={!!codes}
      onClose={handleDone}
      isDismissable={saved}
      isKeyboardDismissDisabled={!saved}
      hideCloseButton={!saved}
      size="md"
      radius="lg"
      backdrop="opaque"
      placement="center"
    >
      <ModalContent>
        {() => (
          <>
            <ModalHeader>{t('profile.twoFactor.backupCodesTitle')}</ModalHeader>
            <ModalBody className="flex flex-col gap-3">
              <div className="bg-success-50 border border-success-200 text-success-700 text-sm rounded-lg px-4 py-3">
                {successMessage}
              </div>
              <p className="text-sm font-bold text-danger">{t('profile.twoFactor.backupCodesWarning')}</p>
              <p className="text-sm text-foreground-500">{t('profile.twoFactor.backupCodesHint')}</p>
              <div className="bg-default-50 border border-divider rounded-xl p-4 grid grid-cols-2 gap-2 select-all">
                {codes?.map((bc) => (
                  <code key={bc} className="text-sm font-mono font-bold">{bc}</code>
                ))}
              </div>
              <Button
                variant="bordered"
                size="sm"
                className="self-start"
                startContent={copy === 'copied' ? <Check size={16} className="text-success" /> : <Copy size={16} />}
                onPress={handleCopy}
              >
                {copy === 'copied' ? t('profile.twoFactor.codesCopied') : t('profile.twoFactor.copyCodes')}
              </Button>
              {copy === 'failed' && (
                <p role="alert" className="text-sm text-danger">{t('profile.twoFactor.copyCodesFailed')}</p>
              )}
              <Checkbox isSelected={saved} onValueChange={setSaved} size="sm">
                {t('profile.twoFactor.codesConfirmed')}
              </Checkbox>
            </ModalBody>
            <ModalFooter>
              <Button color="primary" variant="solid" fullWidth onPress={handleDone} isDisabled={!saved}>
                {t('actions.close')}
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </ResponsiveModal>
  );
}
