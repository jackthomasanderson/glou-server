import { isIntactItem, type UnitKind } from '@shared/units';
import type { CorrectionReason, UnitWriteResult } from '@shared/product';
import type { Wire } from '@shared/wire';
import { apiErrorFrom, DEFAULT_TIMEOUT_MS, timeoutSignal } from '../api';
import { fetchOrNetworkError } from '../network-error';
import type { ProductItem } from './types';

/** D8: what a stock action wrote — the line asked for, the others it changed, those it removed. */
export type StockWrite = Wire<UnitWriteResult>;

export interface CorrectBody { quantity: number; reason: CorrectionReason }
export interface MoveBody { count: number; cellarId: string | null }
export interface RepriceBody { count: number; purchasePrice: number | null }

/** The actions of a line that change a number of copies (#471, A2 and G). */
export type StockAction = 'correct' | 'move' | 'reprice';

/**
 * POST /api/inventory/:id/{correct,move,reprice}. `expectedUpdatedAt` is the
 * line as shown: changed meanwhile, the API answers 409 `CONFLICT` and
 * nothing is written.
 */
export async function postStockAction(
  action: StockAction,
  id: string,
  body: CorrectBody | MoveBody | RepriceBody,
  expectedUpdatedAt: string,
): Promise<StockWrite> {
  const res = await fetchOrNetworkError(`/api/inventory/${encodeURIComponent(id)}/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ ...body, expectedUpdatedAt }),
    signal: timeoutSignal(DEFAULT_TIMEOUT_MS),
  });
  if (!res.ok) throw await apiErrorFrom(res);
  const result = (await res.json()) as Partial<StockWrite> & Pick<StockWrite, 'data'>;
  return { data: result.data, changed: result.changed ?? [], removedIds: result.removedIds ?? [] };
}

/** What one copy of a line is called: a bottle, a box of cigars, a single cigar. */
export type UnitNoun = 'bottle' | 'box' | 'cigar';

export function unitNoun(item: Pick<ProductItem, 'cigarsPerBox'>, kind: UnitKind): UnitNoun {
  if (kind === 'bottle') return 'bottle';
  return item.cigarsPerBox != null ? 'box' : 'cigar';
}

/** Copies on a line: a group's number, one for an opened bottle or box. */
export function lineCopies(item: ProductItem): number {
  return isIntactItem(item) ? Math.max(item.quantity ?? 1, 0) : 1;
}
