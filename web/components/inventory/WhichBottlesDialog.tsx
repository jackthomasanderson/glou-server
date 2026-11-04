'use client';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Radio, RadioGroup } from '@heroui/react';
import type { Preselection } from '@shared/stock-choice';
import { distinctLineLabels } from '@/lib/products/distinctLines';
import type { LineContext } from '@/lib/products/lines';
import type { StockMove } from '@/lib/products/openDrink';
import type { ProductItem } from '@/lib/products/types';
import { LineDialogFrame } from './StockLineDialogParts';

interface WhichBottlesDialogProps {
  /** The wine's name, under the question. */
  wine: string;
  move: StockMove;
  /** The lines a copy can be taken from (several). */
  groups: readonly ProductItem[];
  preselection: Preselection<ProductItem>;
  ctx: LineContext;
  isPending: boolean;
  onConfirm: (line: ProductItem) => void;
  onClose: () => void;
}

/**
 * "Quelles bouteilles ?" (ux-ui.md §10.4.2, FEAT-104 c2-c4; cigars:
 * "Lesquels ?", §10.4.3): one choice among the wine's lines, each shown as
 * in the drawer (cellar, number, price, size, purchase month) — two lines
 * that read the same are told apart (distinctLineLabels). The most likely
 * line is preselected and says why, so one validation suffices.
 */
export function WhichBottlesDialog({ wine, move, groups, preselection, ctx, isPending, onConfirm, onClose }: WhichBottlesDialogProps) {
  const { t } = useTranslation();
  const [chosen, setChosen] = useState(preselection.line.id);
  const line = groups.find((group) => group.id === chosen);
  const labels = useMemo(() => distinctLineLabels(groups, ctx), [groups, ctx]);

  return (
    <LineDialogFrame
      isOpen
      onClose={onClose}
      title={t(ctx.kind === 'cigar' ? 'openDrink.which.titleCigar' : 'openDrink.which.title')}
      line={wine}
      confirmLabel={t(`openDrink.actions.${move}`)}
      onConfirm={() => { if (line) onConfirm(line); }}
      canConfirm={line !== undefined}
      isPending={isPending}
      testId="which-bottles-dialog"
    >
      <RadioGroup
        aria-label={t(ctx.kind === 'cigar' ? 'openDrink.which.titleCigar' : 'openDrink.which.title')}
        value={chosen}
        onValueChange={setChosen}
      >
        {groups.map((group) => (
          <Radio
            key={group.id}
            value={group.id}
            description={group.id === preselection.line.id && preselection.reason
              ? t(`openDrink.which.${ctx.kind === 'cigar' ? 'reasonCigar' : 'reason'}.${preselection.reason}`)
              : undefined}
          >
            {labels.get(group.id)}
          </Radio>
        ))}
      </RadioGroup>
    </LineDialogFrame>
  );
}
