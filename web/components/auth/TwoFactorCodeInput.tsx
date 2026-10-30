'use client';
import { useState } from 'react';
import { Button, Input } from '@heroui/react';
import { useTranslation } from 'react-i18next';

interface TwoFactorCodeInputProps {
  value: string;
  onValueChange: (value: string) => void;
  /** Turning 2FA off or trusting a device also accepts a backup code. */
  allowBackupCode?: boolean;
  isDisabled?: boolean;
  isRequired?: boolean;
  autoFocus?: boolean;
  /** One label for both kinds of code (the sign-in screen); otherwise "6-digit code" / "Backup code". */
  label?: string;
}

/**
 * #652 (after #527 on the sign-in screen): an authenticator code opens the
 * numeric keypad and offers one-time-code autofill. Backup codes are 20 hex
 * characters, so switching to one brings the full keyboard back.
 */
export function TwoFactorCodeInput({
  value, onValueChange, allowBackupCode = false, isDisabled, isRequired, autoFocus, label,
}: TwoFactorCodeInputProps) {
  const { t } = useTranslation();
  const [useBackupCode, setUseBackupCode] = useState(false);

  return (
    <div className="flex flex-col gap-1 w-full">
      <Input
        label={label ?? (useBackupCode ? t('profile.twoFactor.backupCodeLabel') : t('profile.twoFactor.codeLabel'))}
        value={value}
        onValueChange={onValueChange}
        variant="bordered"
        size="md"
        radius="md"
        labelPlacement="outside"
        isDisabled={isDisabled}
        isRequired={isRequired}
        autoFocus={autoFocus}
        {...(useBackupCode
          ? { inputMode: 'text' as const, autoComplete: 'off', autoCapitalize: 'none', maxLength: 20 }
          : { inputMode: 'numeric' as const, pattern: '[0-9]*', autoComplete: 'one-time-code', maxLength: 6 })}
      />
      {allowBackupCode && (
        <Button
          variant="light"
          color="primary"
          size="sm"
          className="self-start"
          onPress={() => { setUseBackupCode((v) => !v); onValueChange(''); }}
          isDisabled={isDisabled}
        >
          {useBackupCode ? t('auth.twoFactor.useAuthenticatorCode') : t('auth.twoFactor.useBackupCode')}
        </Button>
      )}
    </div>
  );
}
