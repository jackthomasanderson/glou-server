'use client';
import React, { useState } from 'react';
import { Button } from '@heroui/react';
import { ArrowLeftRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useHasMounted } from '@/hooks/useHasMounted';
import { formatDate } from '@/lib/format';
import { formatHistoryValue } from '@/lib/inventory/history-format';
import type { UnitNoun } from '@/lib/products/stockActions';
import type { StockMovementCellar, StockMovementView } from '@shared/stock-movement';
import type { Wire } from '@shared/wire';

type Movement = Wire<StockMovementView>;

/** Movements shown before "Show all", most recent first. */
const SHOWN_MOVEMENTS = 10;

interface FamilyMovementsProps {
  movements: Movement[] | undefined;
  /** The journal could not be read (offline, server error): said in one line, the drawer stays usable. */
  isError?: boolean;
  /** What one copy of a line is called (bottle, box, cigar); a line gone falls back on the wine's kind. */
  nounOf: (itemId: string | null) => UnitNoun;
  /** Cigars are counted in cigars when smoked. */
  kind: 'bottle' | 'cigar';
}

/** "+6", "−1" (a real minus sign): the change of the wine's bottles (cigars) in the cellar. */
const signed = (value: number) => (value > 0 ? `+${value}` : `−${Math.abs(value)}`);

/**
 * #848 (FEAT-110, ux-ui.md §10.3 block 6): a wine's movement journal, above
 * its field history — newest first: date, member (or guest), movement, line
 * (its cellar) and difference. The journal starts with the update's line
 * "Mise à jour : 9 en cave"; nothing before it is rebuilt.
 */
export function FamilyMovements({ movements, isError, nounOf, kind }: FamilyMovementsProps) {
  const { t, i18n } = useTranslation();
  const hasMounted = useHasMounted();
  const [showAll, setShowAll] = useState(false);

  if (!movements && !isError) return null;
  if (movements && movements.length === 0) return null;

  const cellarLabel = (cellar: StockMovementCellar | null | undefined) =>
    cellar == null ? t('familyDrawer.lines.noCellar') : cellar.name ?? t('familyDrawer.movements.deletedCellar');
  const price = (value: number | null | undefined) =>
    value == null ? t('stockLine.reprice.noPrice') : formatHistoryValue('purchasePrice', value, t, { lang: i18n.language, cellarName: () => undefined });

  const author = (movement: Movement): string | null => {
    switch (movement.author.kind) {
      case 'member': return movement.author.name;
      case 'guest': return movement.author.name ? t('familyDrawer.movements.guest', { name: movement.author.name }) : t('familyDrawer.movements.guestUnnamed');
      case 'deletedMember': return t('familyDrawer.movements.deletedMember');
      default: return null;
    }
  };

  /** "2 bouteilles déplacées vers Cuisine", "Nombre corrigé : 6 → 5 (cassée, offerte ou perdue)"… */
  const describe = (movement: Movement): string => {
    const noun = nounOf(movement.itemId);
    const count = movement.count;
    switch (movement.kind) {
      case 'INITIAL': return t('familyDrawer.movements.initial', { count });
      case 'ADDED': return t('familyDrawer.movements.added', { context: noun, count });
      case 'OPENED': return t('stockLine.history.opened', { context: noun, count });
      case 'CONSUMED': return kind === 'cigar'
        ? t('stockLine.history.smoked', { count })
        : t('stockLine.history.finished', { context: noun, count });
      case 'UNFINISHED': return t('familyDrawer.movements.unfinished', { context: noun });
      case 'PUT_BACK': return t('familyDrawer.movements.putBack', { context: noun });
      case 'MOVED': return t('familyDrawer.movements.moved', { context: noun, count, from: cellarLabel(movement.fromCellar), to: cellarLabel(movement.toCellar) });
      case 'PRICE_CHANGED': return t('stockLine.history.repriced', { context: noun, count, from: price(movement.fromPrice), to: price(movement.toPrice) });
      case 'CORRECTED': {
        if (movement.from == null || movement.to == null) return t('familyDrawer.movements.cigarsCorrected');
        const line = t('familyDrawer.history.numberChange', { what: t('familyDrawer.movements.corrected'), from: movement.from, to: movement.to });
        return movement.reason ? `${line} (${t(`stockLine.history.reasons.${movement.reason}`)})` : line;
      }
      case 'TRASHED': return t('familyDrawer.movements.trashed', { context: noun, count });
      case 'RESTORED': return t('familyDrawer.movements.restored', { context: noun, count });
      default: return movement.kind;
    }
  };

  /** The line the movement happened on: its cellar (a move names both in its sentence). */
  const lineOf = (movement: Movement): string | null =>
    movement.kind === 'INITIAL' || movement.kind === 'MOVED' ? null : cellarLabel(movement.cellar);

  const list = movements ?? [];
  const shown = showAll ? list : list.slice(0, SHOWN_MOVEMENTS);

  return (
    <section aria-labelledby="family-movements-title">
      <div className="flex items-center gap-1.5 mb-2">
        <ArrowLeftRight size={13} className="text-foreground-500" aria-hidden />
        <h3 id="family-movements-title" className="text-xs font-bold uppercase tracking-widest text-foreground-500">
          {t('familyDrawer.movements.title')}
        </h3>
      </div>
      {isError && !movements ? (
        <p className="text-xs text-foreground-500">{t('familyDrawer.movements.loadError')}</p>
      ) : (
        <ul data-testid="family-movements">
          {shown.map((movement) => {
            const who = author(movement);
            const line = lineOf(movement);
            return (
              <li key={movement.id} className="py-2 border-b border-divider last:border-b-0">
                <div className="flex items-center gap-2">
                  {who && (
                    <span className="px-2 py-0.5 rounded-md bg-primary text-primary-foreground text-xs font-bold min-w-0 truncate" title={who}>
                      {who}
                    </span>
                  )}
                  <span className="ml-auto shrink-0 text-xs text-foreground-400">
                    {hasMounted ? formatDate(movement.createdAt, i18n.language) : ''}
                  </span>
                </div>
                <div className="mt-1 flex items-baseline gap-2">
                  <p className="text-xs text-foreground-500 min-w-0">
                    {describe(movement)}
                    {line && ` · ${line}`}
                  </p>
                  {movement.delta !== 0 && movement.kind !== 'INITIAL' && (
                    <span className="ml-auto shrink-0 text-xs font-bold tabular-nums text-foreground">
                      {/* Read with its meaning; the bare sign is for the eye (a lone "−1" is not announced well). */}
                      <span className="sr-only">{t('familyDrawer.movements.difference', { value: signed(movement.delta) })}</span>
                      <span aria-hidden="true">{signed(movement.delta)}</span>
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {!showAll && list.length > SHOWN_MOVEMENTS && (
        <Button size="sm" variant="light" color="primary" className="mt-1 h-6 px-1.5 text-xs" onPress={() => setShowAll(true)}>
          {t('familyDrawer.movements.showAll', { count: list.length })}
        </Button>
      )}
    </section>
  );
}
