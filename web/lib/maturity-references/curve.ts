// FEAT-86 — consumption / aging curve shapes, UI side.
//
// The readiness MATHS lives only on the backend (api/src/lib/maturity-curve.ts)
// and reaches the UI as a pre-computed `readiness` percentage on inventory
// payloads / alerts. The shape list comes from shared/inventory.ts (#466); this
// module adds the i18n keys and a purely illustrative glyph path so the UI can
// name and sketch each shape.
import type { CurveShape } from '@shared/inventory';

export { CURVE_SHAPES, DEFAULT_CURVE_SHAPE } from '@shared/inventory';
export type { CurveShape } from '@shared/inventory';

/** i18n key for a shape's short label, e.g. t(curveShapeLabelKey('LATE_BELL')). */
export function curveShapeLabelKey(shape: CurveShape): string {
  return `maturity.curveShapes.${shape}.label`;
}

/** i18n key for a shape's one-line description. */
export function curveShapeDescriptionKey(shape: CurveShape): string {
  return `maturity.curveShapes.${shape}.description`;
}

/**
 * Illustrative SVG path for each shape, drawn in a 100 × 28 viewBox with y
 * pointing down (y=0 is the top / "most ready"). Hand-tuned for legibility —
 * NOT sampled from the real readiness function.
 */
export const CURVE_SHAPE_GLYPH: Record<CurveShape, string> = {
  LINEAR: 'M3,25 L97,5',
  BELL: 'M3,26 Q50,-6 97,26',
  EARLY_BELL: 'M3,24 Q22,-5 40,10 Q64,22 97,26',
  LATE_BELL: 'M3,26 Q36,22 60,10 Q78,-5 97,24',
  TWIN_PEAK: 'M3,22 Q15,-3 27,13 Q50,29 73,13 Q85,-3 97,22',
  PLATEAU: 'M3,20 L16,6 L84,6 L97,20',
};
