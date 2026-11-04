'use client';
import React, { useCallback, useState } from 'react';
import { openableGroups, preselectGroup } from '@shared/stock-choice';
import { useStockMove } from '@/hooks/useStockMove';
import type { LineContext } from '@/lib/products/lines';
import type { StockMove } from '@/lib/products/openDrink';
import { firstStep, fullStep, type FirstStep } from '@/lib/products/openedReminder';
import type { ProductItem } from '@/lib/products/types';
import { OpenedReminderDialog } from './OpenedReminderDialog';
import { WhichBottlesDialog } from './WhichBottlesDialog';

type Asking =
  | { step: 'remind'; move: StockMove; opened: ProductItem[]; hasFull: boolean; groups: ProductItem[]; line?: ProductItem }
  | { step: 'which'; move: StockMove; groups: ProductItem[] };

interface StockMoveFlowOptions {
  wine: string;
  ctx: LineContext;
  /** The cellars being looked at: their line is preselected (FEAT-104 c3). */
  viewedCellarIds?: readonly string[];
  /** "Finir l'entamée": leads to that opened bottle in the drawer (its level, "Je la finis"). */
  onFinishOpened?: (item: ProductItem) => void;
}

/**
 * #471 (ux-ui.md §10.4.2-10.4.3, FEAT-103/104/105): the whole sequence of
 * "J'en ouvre une" / "J'en bois une" / "J'en fume un", each step skipped
 * when it has no reason to be:
 * 1. the reminder of the opened bottle (box) of the wine (FEAT-105);
 * 2. "Quelles bouteilles ?" among several full lines (FEAT-104), unless a
 *    line's menu already said which;
 * 3. the write, with "Annuler" for 5 seconds.
 * `start(move, items, line?)`: the wine's copies, and the full line of a
 * line's menu. Render `dialogs`.
 */
export function useStockMoveFlow({ wine, ctx, viewedCellarIds, onFinishOpened }: StockMoveFlowOptions) {
  const { run, isPending } = useStockMove();
  const [asking, setAsking] = useState<Asking | null>(null);

  /** After the reminder, or without one: the line to write, or "Quelles bouteilles ?". */
  const go = useCallback((move: StockMove, step: FirstStep) => {
    if (step.step === 'run') {
      setAsking(null);
      void run(step.line, move, ctx.kind);
    } else if (step.step === 'which') {
      setAsking({ step: 'which', move, groups: step.groups });
    } else {
      setAsking(null);
    }
  }, [ctx.kind, run]);

  const start = useCallback((move: StockMove, items: readonly ProductItem[], line?: ProductItem) => {
    const step = firstStep(move, items, line);
    if (step.step === 'remind') {
      setAsking({ step: 'remind', move, opened: step.opened, hasFull: step.hasFull, groups: openableGroups(items), line });
      return;
    }
    go(move, step);
  }, [go]);

  const close = () => setAsking(null);
  let dialogs: React.ReactNode = null;
  if (asking?.step === 'remind') {
    const { move, opened, hasFull, groups, line } = asking;
    dialogs = (
      <OpenedReminderDialog
        wine={wine}
        move={move}
        opened={opened}
        hasFull={hasFull}
        hasClosedBox={(line ? [line] : groups).some((group) => group.cigarsPerBox != null)}
        ctx={ctx}
        isPending={isPending}
        onClose={close}
        onUseOpened={async (item) => {
          if (move === 'open') {
            // Nothing is opened: the opened bottle, to set its level or finish it.
            close();
            onFinishOpened?.(item);
            return;
          }
          if (await run(item, move, ctx.kind)) close();
        }}
        onNew={() => {
          // The full lines, as known when the reminder was asked.
          go(move, fullStep(groups, line));
        }}
      />
    );
  } else if (asking?.step === 'which') {
    const { move, groups } = asking;
    const preselection = preselectGroup(groups, { cellarIds: viewedCellarIds });
    if (preselection) {
      dialogs = (
        <WhichBottlesDialog
          wine={wine}
          move={move}
          groups={groups}
          preselection={preselection}
          ctx={ctx}
          isPending={isPending}
          onClose={close}
          onConfirm={async (chosen) => {
            if (await run(chosen, move, ctx.kind)) close();
          }}
        />
      );
    }
  }

  return { start, dialogs, isPending };
}
