import { beforeAll, describe, expect, it } from 'vitest';
import { frenchT } from '@/lib/products/__tests__/i18n';
import { valuationKpi } from './valuation';

let t: Awaited<ReturnType<typeof frenchT>>;
beforeAll(async () => { t = await frenchT(); });

const euros = (n: number) => `${n} €`;

// #702: a bottle with no price counts 0 €; the KPI must not show a bare 0 €.
describe('valuationKpi', () => {
  it('says the price is not entered when no unit in stock has one', () => {
    expect(valuationKpi({ totalValuation: 0, totalActiveItems: 6, unpricedUnits: 6 }, euros, t)).toEqual({
      value: 'Prix non renseigné',
      hint: "Renseignez un prix d'achat ou une valeur estimée pour la calculer",
    });
  });

  it('gives the value and how many units have no price when some are missing', () => {
    expect(valuationKpi({ totalValuation: 120, totalActiveItems: 9, unpricedUnits: 3 }, euros, t)).toEqual({
      value: '120 €',
      hint: 'Estimation totale actuelle, dont 3 sans prix',
    });
  });

  it('gives the value alone when every unit has a price, or the cellar is empty', () => {
    expect(valuationKpi({ totalValuation: 120, totalActiveItems: 9, unpricedUnits: 0 }, euros, t))
      .toEqual({ value: '120 €', hint: 'Estimation totale actuelle' });
    expect(valuationKpi({ totalValuation: 0, totalActiveItems: 0, unpricedUnits: 0 }, euros, t))
      .toEqual({ value: '0 €', hint: 'Estimation totale actuelle' });
  });
});
