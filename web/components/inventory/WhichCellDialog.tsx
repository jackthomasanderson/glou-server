'use client';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Radio, RadioGroup } from '@heroui/react';
import type { SlotChoiceFields } from '@shared/product';
import { cellAnswer, cellTitle, preselectedCell, UNPLACED, type CellAsk } from '@/lib/products/cells';
import { LineDialogFrame } from './StockLineDialogParts';

interface WhichCellDialogProps {
  /** The wine, under the question. */
  wine?: string;
  /** The line the copy is taken from, as the drawer shows it ("×6 · Garage · 20 € / bouteille"). */
  line: string;
  /** The cells of the line, and its copies unplaced. */
  ask: CellAsk;
  /** What the answer does: "J'en ouvre une", "J'en bois une", "Bue"… */
  confirmLabel: string;
  /** Which move it is, for the hint ("La bouteille ouverte garde sa case."). */
  move: 'open' | 'drink' | 'smoke';
  isPending: boolean;
  onConfirm: (answer: SlotChoiceFields) => void;
  onClose: () => void;
}

/**
 * FEAT-93 (plan §5, decision #471 point 76): "De quelle case ?" — opening,
 * drinking or smoking one copy of a line of several placed on the plan: one
 * choice per cell of the line, and "Non rangée" while a copy is unplaced,
 * then preselected (never a cell emptied by a distracted validation).
 */
export function WhichCellDialog({ wine, line, ask, confirmLabel, move, isPending, onConfirm, onClose }: WhichCellDialogProps) {
  const { t } = useTranslation();
  const [chosen, setChosen] = useState<string | null>(() => preselectedCell(ask));
  const title = t('stockLine.slots.whichTitle');
  // "Non rangée" first while one is left, then each cell of the line.
  const options = [
    ...(ask.unplaced > 0
      ? [{ value: UNPLACED, label: t('stockLine.slots.unplacedChoice'), description: t('stockLine.slots.unplacedCount', { count: ask.unplaced }) }]
      : []),
    ...ask.slots.map((slot) => ({ value: slot.id, label: cellTitle(slot, t), description: undefined })),
  ];

  return (
    <LineDialogFrame
      isOpen
      onClose={onClose}
      title={title}
      wine={wine}
      line={line}
      confirmLabel={confirmLabel}
      onConfirm={() => { if (chosen) onConfirm(cellAnswer(chosen)); }}
      canConfirm={chosen !== null}
      isPending={isPending}
      testId="which-cell-dialog"
    >
      <p className="text-xs text-foreground-500">{t('stockLine.slots.whichHint', { context: move })}</p>
      <RadioGroup aria-label={title} value={chosen ?? ''} onValueChange={setChosen}>
        {options.map((option) => (
          <Radio key={option.value} value={option.value} description={option.description}>{option.label}</Radio>
        ))}
      </RadioGroup>
    </LineDialogFrame>
  );
}
