import { prisma } from '../lib/prisma';
import { MaturityReferenceInput, MaturityReferencePatch, SuggestQuery } from '../schemas/maturity-reference.schema';
import { CurveShape, DEFAULT_CURVE_SHAPE } from '../lib/maturity-curve';

type MaturityReference = Awaited<ReturnType<typeof prisma.maturityReference.findFirst>> extends infer T | null
  ? NonNullable<T>
  : never;

export interface MaturitySuggestion {
  reference: MaturityReference;
  peakMaturityFrom: number | null;
  peakMaturityTo: number | null;
  // FEAT-86: curve shape carried by the winning reference — the add form
  // pre-fills the bottle's `curveShape` with it, same "visible, editable
  // default" contract as the window bounds.
  curveShape: CurveShape;
}

function scoreMatch(ref: MaturityReference, params: SuggestQuery): number {
  let score = 0;
  if (ref.producer && params.producer &&
      ref.producer.toLowerCase() === params.producer.toLowerCase()) score += 4;
  if (ref.region && params.region &&
      params.region.toLowerCase().includes(ref.region.toLowerCase())) score += 3;
  if (ref.color && params.color && ref.color === params.color) score += 2;
  if (ref.vintageFrom != null && ref.vintageTo != null && params.vintage != null &&
      params.vintage >= ref.vintageFrom && params.vintage <= ref.vintageTo) score += 1;
  return score;
}

function computeWindow(ref: MaturityReference, vintage?: number): { from: number | null; to: number | null } {
  if (ref.mode === 'ABSOLUTE') {
    return { from: ref.windowFrom, to: ref.windowTo };
  }
  if (vintage != null) {
    return { from: vintage + ref.windowFrom, to: vintage + ref.windowTo };
  }
  return { from: null, to: null };
}

export class MaturityReferenceService {
  async list(): Promise<(MaturityReference & { bottleCount: number })[]> {
    // FEAT-86: cascade order — highest priority first, so the admin table
    // reads top-to-bottom as "first matching rule wins".
    const refs = await prisma.maturityReference.findMany({
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    });

    const counts = await Promise.all(
      refs.map((r) => this.countMatchingBottles(r))
    );

    return refs.map((r, i) => ({ ...r, bottleCount: counts[i] }));
  }

  async create(data: MaturityReferenceInput): Promise<MaturityReference> {
    return prisma.maturityReference.create({ data });
  }

  async update(id: string, patch: MaturityReferencePatch): Promise<MaturityReference | null> {
    try {
      return await prisma.maturityReference.update({ where: { id }, data: patch });
    } catch {
      return null;
    }
  }

  async delete(id: string): Promise<boolean> {
    try {
      await prisma.maturityReference.delete({ where: { id } });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * FEAT-86: rewrite the whole cascade priority in one transaction. `ids` is
   * the references top-to-bottom in their new order — the first gets the
   * highest priority. Ids not present are left untouched; unknown ids are
   * skipped rather than failing the batch.
   */
  async reorder(ids: string[]): Promise<void> {
    const existing = await prisma.maturityReference.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });
    const known = new Set(existing.map((r) => r.id));
    const ordered = ids.filter((id) => known.has(id));

    await prisma.$transaction(
      ordered.map((id, index) =>
        prisma.maturityReference.update({
          where: { id },
          data: { priority: ordered.length - index },
        }),
      ),
    );
  }

  async suggest(params: SuggestQuery): Promise<MaturitySuggestion | null> {
    const refs = await prisma.maturityReference.findMany({
      where: { category: params.category as never },
    });

    if (refs.length === 0) return null;

    // FEAT-86 cascade resolution: explicit `priority` first (the admin's
    // ordered rules), then criteria specificity (`score`), then recency.
    const scored = refs
      .map((r) => ({ ref: r, score: scoreMatch(r, params) }))
      .sort(
        (a, b) =>
          b.ref.priority - a.ref.priority ||
          b.score - a.score ||
          b.ref.createdAt.getTime() - a.ref.createdAt.getTime(),
      );

    const best = scored[0];
    const window = computeWindow(best.ref, params.vintage);

    return {
      reference: best.ref,
      peakMaturityFrom: window.from,
      peakMaturityTo: window.to,
      curveShape: (best.ref.curveShape as CurveShape | null) ?? DEFAULT_CURVE_SHAPE,
    };
  }

  private async countMatchingBottles(ref: MaturityReference): Promise<number> {
    const where: Record<string, unknown> = {
      category: ref.category,
      deletedAt: null,
    };
    if (ref.region) where['region'] = { contains: ref.region, mode: 'insensitive' };
    if (ref.color) where['color'] = ref.color;
    if (ref.producer) where['producer'] = { contains: ref.producer, mode: 'insensitive' };
    if (ref.vintageFrom != null && ref.vintageTo != null) {
      where['vintage'] = { gte: ref.vintageFrom, lte: ref.vintageTo };
    }
    return prisma.inventoryItem.count({ where: where as never });
  }
}

export const maturityReferenceService = new MaturityReferenceService();
