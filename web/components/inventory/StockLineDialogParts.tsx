'use client';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Button, ModalBody, ModalContent, ModalFooter, ModalHeader } from '@heroui/react';
import { Minus, Plus } from 'lucide-react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { ParsedNumberInput } from '@/components/ui/ParsedInput';

/** A whole number from `min` to `max`: what a "Combien ?" answer may be. */
export const isCountIn = (value: number | undefined, min: number, max: number): value is number =>
  value !== undefined && Number.isInteger(value) && value >= min && value <= max;

/** A price in cents (the API refuses more decimals), or empty: no price. */
export const isPrice = (value: number | undefined) =>
  value === undefined || (value >= 0 && Math.abs(Math.round(value * 100) - value * 100) < 1e-6);

/**
 * ux-ui.md §10.4: every "Combien ?" offers a number from `min` to the line's
 * total, set from the keyboard and with − / +.
 */
export function CountField({ label, value, onChange, min, max, testId }: {
  label: string;
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  min: number;
  max: number;
  testId?: string;
}) {
  const { t } = useTranslation();
  const valid = isCountIn(value, min, max);
  const step = (by: number) => onChange(Math.min(max, Math.max(min, (valid ? value : max) + by)));
  return (
    <div className="flex items-start gap-2">
      <Button isIconOnly variant="bordered" size="lg" aria-label={t('stockLine.count.less')} onPress={() => step(-1)} isDisabled={valid && value <= min}>
        <Minus size={16} />
      </Button>
      <ParsedNumberInput
        label={label}
        value={value}
        onValueChange={onChange}
        min={min}
        max={max}
        step={1}
        variant="bordered"
        isInvalid={!valid}
        errorMessage={t('stockLine.count.range', { min, max })}
        data-testid={testId}
        className="flex-1"
      />
      <Button isIconOnly variant="bordered" size="lg" aria-label={t('stockLine.count.more')} onPress={() => step(1)} isDisabled={valid && value >= max}>
        <Plus size={16} />
      </Button>
    </div>
  );
}

/** The frame of a line's dialog: the question, the line it is about, Annuler / the action. */
export function LineDialogFrame({ isOpen, onClose, title, line, children, confirmLabel, onConfirm, canConfirm, isPending, danger = false, testId }: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  /** The line as the drawer shows it: "×6 · Garage · 20 € / bouteille". */
  line: string;
  children?: React.ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  canConfirm: boolean;
  isPending: boolean;
  danger?: boolean;
  testId?: string;
}) {
  const { t } = useTranslation();
  return (
    <ResponsiveModal isOpen={isOpen} onClose={onClose} size="sm" radius="lg" backdrop="opaque" placement="center">
      <ModalContent data-testid={testId}>
        {() => (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (canConfirm && !isPending) onConfirm();
            }}
          >
            <ModalHeader className="flex flex-col gap-0.5 pb-1">
              <span>{title}</span>
              <span className="text-xs font-normal text-foreground-500">{line}</span>
            </ModalHeader>
            <ModalBody className="py-2 flex flex-col gap-3">{children}</ModalBody>
            <ModalFooter className="flex gap-2 px-4 pb-4 pt-2">
              <Button variant="light" onPress={onClose} isDisabled={isPending} className="flex-1">
                {t('actions.cancel')}
              </Button>
              <Button type="submit" color={danger ? 'danger' : 'primary'} isDisabled={!canConfirm} isLoading={isPending} className="flex-1">
                {confirmLabel}
              </Button>
            </ModalFooter>
          </form>
        )}
      </ModalContent>
    </ResponsiveModal>
  );
}
