'use client';
import React, { useState } from 'react';
import { Button, Chip, Slider } from '@heroui/react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { isIntactItem } from '@shared/units';
import { goneParts, goneSummary, lineParts, VISIBLE_LINES, type FamilyLines, type LineContext } from '@/lib/products/lines';
import type { ProductItem } from '@/lib/products/types';

interface FamilyStockLinesProps {
  lines: FamilyLines;
  ctx: LineContext;
  /**
   * Sets the level of an opened bottle (a single copy: nothing is detached).
   * A group of full bottles never gets a level control: opening one of them
   * is "J'en ouvre une" (lot L1), which says which one.
   */
  onLevelCommit?: (item: ProductItem, level: number) => void;
  isSaving?: boolean;
  /** The menu of a line (W3: "J'en ouvre une", "Déplacer", "Corriger le nombre"…). */
  lineActions?: (item: ProductItem) => React.ReactNode;
}

const join = (parts: string[]) => parts.join(' · ');

/** The level of one opened bottle, set on its own line (§10.3). */
function OpenedLevel({ item, label, onCommit, isDisabled }: {
  item: ProductItem;
  label: string;
  onCommit: (level: number) => void;
  isDisabled: boolean;
}) {
  const level = item.fillLevel ?? 0;
  const [shown, setShown] = useState(level);
  // Follows the saved level (answer of the save, another device) unless being dragged.
  const [prevLevel, setPrevLevel] = useState(level);
  if (level !== prevLevel) {
    setPrevLevel(level);
    setShown(level);
  }
  return (
    <div className="flex items-center gap-3 mt-1">
      <Slider
        aria-label={label}
        value={shown}
        onChange={(value) => setShown(value as number)}
        onChangeEnd={(value) => { if (value !== level) onCommit(value as number); }}
        minValue={0}
        maxValue={100}
        step={5}
        size="sm"
        color={shown <= 20 ? 'danger' : 'warning'}
        isDisabled={isDisabled}
        className="flex-1"
      />
      <span className="text-sm font-bold tabular-nums w-12 text-right">{shown} %</span>
    </div>
  );
}

/**
 * Blocks 2 and 3 of a wine's drawer (ux-ui.md §10.3): one line per group,
 * then the opened bottles, the first five then "Voir les N autres"; below,
 * "Déjà bues ou parties", folded.
 */
export function FamilyStockLines({ lines, ctx, onLevelCommit, isSaving = false, lineActions }: FamilyStockLinesProps) {
  const { t, kind } = ctx;
  const [showAll, setShowAll] = useState(false);
  const [showGone, setShowGone] = useState(false);
  const visible = showAll ? lines.inCellar : lines.inCellar.slice(0, VISIBLE_LINES);
  const hidden = lines.inCellar.length - VISIBLE_LINES;

  return (
    <div className="flex flex-col gap-4">
      <section aria-labelledby="family-lines-title">
        <h3 id="family-lines-title" className="text-xs font-bold uppercase tracking-widest text-foreground-500 mb-2">
          {t(kind === 'cigar' ? 'familyDrawer.lines.titleCigar' : 'familyDrawer.lines.title')}
        </h3>
        {lines.inCellar.length === 0 ? (
          <p className="text-sm text-foreground-500">
            {t(kind === 'cigar' ? 'familyDrawer.lines.emptyCigar' : 'familyDrawer.lines.empty')}
          </p>
        ) : (
          <ul className="flex flex-col gap-2" data-testid="family-lines">
            {visible.map((item) => {
              const opened = !isIntactItem(item);
              return (
                <li
                  key={item.id}
                  data-testid="family-line"
                  className={`px-3 py-2 rounded-xl border ${opened ? 'border-warning-300 bg-warning-50/40' : 'border-divider'}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium leading-snug">{join(lineParts(item, ctx, lines.showPurchaseMonth))}</p>
                    {lineActions?.(item)}
                  </div>
                  {item.needsReview && (
                    <Chip size="sm" variant="flat" color="primary" className="mt-1">{t('familyDrawer.lines.needsReview')}</Chip>
                  )}
                  {opened && kind === 'bottle' && onLevelCommit && (
                    <OpenedLevel
                      item={item}
                      label={t('familyDrawer.lines.level')}
                      onCommit={(level) => onLevelCommit(item, level)}
                      isDisabled={isSaving}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {hidden > 0 && (
          <Button
            size="sm"
            variant="light"
            className="mt-1"
            endContent={showAll ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            onPress={() => setShowAll((open) => !open)}
          >
            {showAll ? t('familyDrawer.lines.showLess') : t('familyDrawer.lines.showMore', { count: hidden })}
          </Button>
        )}
      </section>

      {lines.gone.length > 0 && (
        <section>
          <Button
            size="sm"
            variant="light"
            className="px-0 h-auto min-w-0 justify-start"
            aria-expanded={showGone}
            aria-controls="family-gone-lines"
            endContent={showGone ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            onPress={() => setShowGone((open) => !open)}
          >
            <span className="text-xs font-bold uppercase tracking-widest text-foreground-500">
              {t(kind === 'cigar' ? 'familyDrawer.gone.titleCigar' : 'familyDrawer.gone.title')}
            </span>
            <span className="text-xs text-foreground-500 normal-case">{goneSummary(lines, kind, t)}</span>
          </Button>
          {showGone && (
            <ul id="family-gone-lines" className="flex flex-col gap-1 mt-2" data-testid="family-gone-lines">
              {lines.gone.map((item) => (
                <li key={item.id} className="text-sm text-foreground-500 px-3 py-1.5 rounded-lg bg-default-50">
                  {join(goneParts(item, ctx))}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
