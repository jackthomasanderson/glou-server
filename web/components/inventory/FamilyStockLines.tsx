'use client';
import React, { useEffect, useRef, useState } from 'react';
import { Button, Chip, Slider, Tooltip } from '@heroui/react';
import { ChevronDown, ChevronUp, Clock } from 'lucide-react';
import { isProvisional } from '@/lib/offline/optimistic';
import { isIntactItem } from '@shared/units';
import { goneParts, goneSummary, hasOwnLevel, lineParts, VISIBLE_LINES, type FamilyLines, type LineContext } from '@/lib/products/lines';
import type { ProductItem } from '@/lib/products/types';
import { FieldSourceBadge } from './FieldSourceBadge';

interface FamilyStockLinesProps {
  lines: FamilyLines;
  ctx: LineContext;
  /**
   * Sets the level of an opened bottle (a single copy: nothing is detached);
   * rejects when refused. A group of full bottles never gets a level
   * control: opening one of them is "J'en ouvre une" (lot L1), which says which one.
   */
  onLevelCommit?: (item: ProductItem, level: number) => Promise<unknown>;
  /** The menu of a line (W3: "J'en ouvre une", "Déplacer", "Corriger le nombre"…). */
  lineActions?: (item: ProductItem) => React.ReactNode;
  /** Under a line marked "à vérifier": "C'est bon" / "Corriger le nombre" (§10.3, §10.7). */
  reviewActions?: (item: ProductItem) => React.ReactNode;
  /**
   * A line to lead to ("Finir l'entamée", FEAT-105 c2): shown even behind
   * "Voir les N autres", scrolled to and focused. A new `nonce` leads to it again.
   */
  focus?: { id: string; nonce: number } | null;
  /**
   * FEAT-108: the lines with a change waiting for the network ("en
   * attente"). A copy shown taken off its group before the server did it
   * (provisional) is marked too, and has no action until then.
   */
  pendingIds?: ReadonlySet<string>;
}

/** The "en attente" mark of a line (§10.8): the clock and its tooltip, read by screen readers. */
function PendingMark({ t }: { t: LineContext['t'] }) {
  const label = t('offline.pendingSyncTooltip');
  return (
    <Tooltip content={label} delay={300}>
      <span role="img" className="inline-flex items-center ml-1.5 align-middle text-warning-600" data-testid="line-pending" tabIndex={0} aria-label={label}>
        <Clock size={12} aria-hidden />
      </span>
    </Tooltip>
  );
}

const join = (parts: string[]) => parts.join(' · ');

/** A level of 100 % puts an opened bottle back full (§10.4.6). */
const FULL = 100;

const PRESETS = [
  { value: FULL, key: 'familyDrawer.lines.levelFull' },
  { value: 50, key: 'familyDrawer.lines.levelHalf' },
  { value: 0, key: 'familyDrawer.lines.levelEmpty' },
] as const;

/**
 * The level of one opened bottle, set on its own line (§10.3): a slider and
 * the Pleine / Moitié / Vide shortcuts. Never disabled while saving (keyboard
 * focus would be lost): a level chosen meanwhile waits and is sent next, the
 * last one only. A refused save puts the slider back on the saved level.
 */
export function OpenedLevel({ item, t, onCommit }: {
  item: ProductItem;
  t: LineContext['t'];
  onCommit: (level: number) => Promise<unknown>;
}) {
  const level = item.fillLevel ?? 0;
  const [shown, setShown] = useState(level);
  // Follows the saved level (answer of the save, another device).
  const [prevLevel, setPrevLevel] = useState(level);
  if (level !== prevLevel) {
    setPrevLevel(level);
    setShown(level);
  }
  const saving = useRef(false);
  const waiting = useRef<number | null>(null);
  const saved = useRef(level);
  useEffect(() => { saved.current = level; }, [level]);

  const send = async (value: number) => {
    saving.current = true;
    try {
      await onCommit(value);
      // Saved now, not when the answer reaches the props: a level chosen
      // meanwhile that goes back to the previous one is still sent.
      saved.current = value;
      // Put back full, the bottle rejoined its line (or is full again): no
      // opened bottle is left to set a level on — a level waiting would be
      // sent to a bottle that no longer exists.
      if (value >= FULL) waiting.current = null;
    } catch {
      // Refused (a tasting on it, a conflict, a server error): back to what is saved.
      waiting.current = null;
      setShown(saved.current);
    } finally {
      saving.current = false;
    }
    const next = waiting.current;
    waiting.current = null;
    if (next != null && (next !== saved.current || next >= FULL)) void send(next);
  };
  const commit = (value: number) => {
    setShown(value);
    if (saving.current) {
      waiting.current = value;
      return;
    }
    // "Pleine" always sends: an opened bottle at 100 % (just opened) is put
    // back full with the others (§10.4.6), even if its level does not move.
    if (value !== saved.current || value >= FULL) void send(value);
  };

  return (
    <div className="mt-1">
      <div className="flex items-center gap-3">
        <Slider
          aria-label={t('familyDrawer.lines.level')}
          value={shown}
          onChange={(value) => setShown(value as number)}
          onChangeEnd={(value) => commit(value as number)}
          minValue={0}
          maxValue={100}
          step={5}
          size="sm"
          color={shown <= 20 ? 'danger' : 'warning'}
          className="flex-1"
        />
        <span className="text-sm font-bold tabular-nums w-12 text-right">{shown} %</span>
      </div>
      <div className="flex gap-2 mt-1">
        {PRESETS.map(({ value, key }) => (
          <Button
            key={value}
            size="sm"
            variant={shown === value ? 'solid' : 'bordered'}
            color={shown === value ? 'warning' : 'default'}
            className="flex-1 h-7"
            onPress={() => commit(value)}
          >
            {t(key)}
          </Button>
        ))}
      </div>
    </div>
  );
}

/**
 * Blocks 2 and 3 of a wine's drawer (ux-ui.md §10.3): one line per group,
 * then the opened bottles, the first five then "Voir les N autres"; below,
 * "Déjà bues ou parties", folded.
 */
export function FamilyStockLines({ lines, ctx, onLevelCommit, lineActions, reviewActions, focus, pendingIds }: FamilyStockLinesProps) {
  const isPending = (item: ProductItem) => isProvisional(item) || (pendingIds?.has(item.id) ?? false);
  const { t, kind } = ctx;
  const [showAll, setShowAll] = useState(false);
  const [showGone, setShowGone] = useState(false);
  const lineRefs = useRef(new Map<string, HTMLLIElement>());
  // A line led to behind "Voir les N autres" is shown first (adjusted during render).
  const [prevFocus, setPrevFocus] = useState(focus);
  if (focus !== prevFocus) {
    setPrevFocus(focus);
    if (focus && lines.inCellar.findIndex((item) => item.id === focus.id) >= VISIBLE_LINES) setShowAll(true);
  }
  const focused = useRef<number | null>(null);
  useEffect(() => {
    if (!focus || focused.current === focus.nonce) return;
    const line = lineRefs.current.get(focus.id);
    if (!line) return;
    focused.current = focus.nonce;
    line.scrollIntoView?.({ block: 'center' });
    // The ring marks the line « Finir l'entamée » led to, until it loses focus; a plain click does not draw it.
    line.dataset.ringed = 'true';
    line.focus();
  }, [focus, showAll]);
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
              const provisional = isProvisional(item);
              return (
                <li
                  key={item.id}
                  ref={(node) => { if (node) lineRefs.current.set(item.id, node); else lineRefs.current.delete(item.id); }}
                  tabIndex={-1}
                  onBlur={(event) => { delete event.currentTarget.dataset.ringed; }}
                  data-testid="family-line"
                  data-line-id={item.id}
                  className={`px-3 py-2 rounded-xl border outline-none data-[ringed=true]:ring-2 ring-primary ${opened ? 'border-warning-300 bg-warning-50/40' : 'border-divider'}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium leading-snug">
                      {join(lineParts(item, ctx, lines.showPurchaseMonth))}
                      {item.purchasePrice != null && (
                        <span className="ml-1.5 inline-flex align-middle">
                          <FieldSourceBadge source={item.fieldSources?.purchasePrice} t={t} />
                        </span>
                      )}
                      {isPending(item) && <PendingMark t={t} />}
                    </p>
                    {!provisional && lineActions?.(item)}
                  </div>
                  {item.needsReview && (
                    <>
                      <Chip size="sm" variant="flat" color="primary" className="mt-1">{t('familyDrawer.lines.needsReview')}</Chip>
                      {reviewActions?.(item)}
                    </>
                  )}
                  {hasOwnLevel(item) && kind === 'bottle' && onLevelCommit && !provisional && (
                    <OpenedLevel item={item} t={t} onCommit={(level) => onLevelCommit(item, level)} />
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
          <button
            type="button"
            className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-left rounded-lg hover:bg-default-100 px-1 -mx-1 py-0.5"
            aria-expanded={showGone}
            aria-controls="family-gone-lines"
            onClick={() => setShowGone((open) => !open)}
          >
            <span className="text-xs font-bold uppercase tracking-widest text-foreground-500">
              {t(kind === 'cigar' ? 'familyDrawer.gone.titleCigar' : 'familyDrawer.gone.title')}
            </span>
            <span className="text-xs text-foreground-500">{goneSummary(lines, kind, t)}</span>
            {showGone ? <ChevronUp size={14} aria-hidden /> : <ChevronDown size={14} aria-hidden />}
          </button>
          {showGone && (
            <ul id="family-gone-lines" className="flex flex-col gap-1 mt-2" data-testid="family-gone-lines">
              {lines.gone.map((item) => (
                <li key={item.id} className="text-sm text-foreground-500 px-3 py-1.5 rounded-lg bg-default-50">
                  {join(goneParts(item, ctx))}
                  {isPending(item) && <PendingMark t={t} />}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
