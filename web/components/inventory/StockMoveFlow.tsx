'use client';
import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { SlotChoiceFields } from '@shared/product';
import { openableGroups, preselectGroup } from '@shared/stock-choice';
import { useStockMove } from '@/hooks/useStockMove';
import { lineParts, type LineContext } from '@/lib/products/lines';
import { cellChoiceFor, type CellAsk } from '@/lib/products/cells';
import type { StockMove } from '@/lib/products/openDrink';
import { firstStep, fullStep, type FirstStep } from '@/lib/products/openedReminder';
import type { ProductItem } from '@/lib/products/types';
import { isProvisional } from '@/lib/offline/optimistic';
import { OpenedReminderDialog } from './OpenedReminderDialog';
import { WhichBottlesDialog } from './WhichBottlesDialog';
import { WhichCellDialog } from './WhichCellDialog';

type Asking =
  | { step: 'remind'; move: StockMove; opened: ProductItem[]; hasFull: boolean; groups: ProductItem[]; line?: ProductItem }
  | { step: 'which'; move: StockMove; groups: ProductItem[] }
  | { step: 'cell'; move: StockMove; line: ProductItem; ask: CellAsk };

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
 * 3. "De quelle case ?" when the line holds cells of the plan and several
 *    copies (FEAT-93, decision #471 point 76), or when the API asks it;
 * 4. the write, with "Annuler" for 8 seconds.
 * `start(move, items, line?)`: the wine's copies, and the full line of a
 * line's menu. `startFromCell(move, line, slotId)`: the cell of the plan
 * touched says which copy (decision #471 point 77) — no question. Render `dialogs`.
 */
export function useStockMoveFlow({ wine, ctx, viewedCellarIds, onFinishOpened }: StockMoveFlowOptions) {
  const { t } = useTranslation();
  const { run, isPending } = useStockMove();
  const [asking, setAsking] = useState<Asking | null>(null);

  /** The write, and "De quelle case ?" again if the API asks it (the line changed meanwhile). */
  const write = useCallback((line: ProductItem, move: StockMove, choice?: SlotChoiceFields) =>
    run(line, move, ctx.kind, { choice, onAskCell: (ask) => setAsking({ step: 'cell', move, line, ask }) }),
  [ctx.kind, run]);

  /** A line chosen: "De quelle case ?" when it matters, else the write. False when not written (yet). */
  const take = useCallback(async (line: ProductItem, move: StockMove): Promise<boolean> => {
    const ask = cellChoiceFor(line, ctx.kind);
    if (ask) {
      setAsking({ step: 'cell', move, line, ask });
      return false;
    }
    return write(line, move);
  }, [ctx.kind, write]);

  /** After the reminder, or without one: the line to write, or "Quelles bouteilles ?". */
  const go = useCallback((move: StockMove, step: FirstStep) => {
    if (step.step === 'run') {
      setAsking(null);
      void take(step.line, move);
    } else if (step.step === 'which') {
      setAsking({ step: 'which', move, groups: step.groups });
    } else {
      setAsking(null);
    }
  }, [take]);

  const start = useCallback((move: StockMove, all: readonly ProductItem[], line?: ProductItem) => {
    // FEAT-108: a copy shown before the server took it off its group
    // (offline) is neither reminded of nor chosen: it has no id there yet.
    if (line && isProvisional(line)) return;
    const items = all.filter((item) => !isProvisional(item));
    const step = firstStep(move, items, line);
    if (step.step === 'remind') {
      setAsking({ step: 'remind', move, opened: step.opened, hasFull: step.hasFull, groups: openableGroups(items), line });
      return;
    }
    go(move, step);
  }, [go]);

  /** From a cell of the plan: that very copy, no reminder, no question (decision #471 point 77). */
  const startFromCell = useCallback((move: StockMove, line: ProductItem, slotId: string) => {
    if (isProvisional(line)) return;
    setAsking(null);
    void write(line, move, { fromSlotId: slotId });
  }, [write]);

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
            if (await take(chosen, move)) close();
          }}
        />
      );
    }
  } else if (asking?.step === 'cell') {
    const { move, line, ask } = asking;
    dialogs = (
      <WhichCellDialog
        // A new question (asked again by the API) starts from its own preselection.
        key={ask.slots.map((slot) => slot.id).join('|') + ask.unplaced}
        wine={wine}
        line={lineParts(line, ctx).join(' · ')}
        ask={ask}
        move={move}
        confirmLabel={t(`openDrink.actions.${move}`)}
        isPending={isPending}
        onClose={close}
        onConfirm={async (answer) => {
          if (await write(line, move, answer)) close();
        }}
      />
    );
  }

  return { start, startFromCell, dialogs, isPending };
}
