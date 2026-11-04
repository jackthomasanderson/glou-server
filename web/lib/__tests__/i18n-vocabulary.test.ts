import { describe, it, expect } from 'vitest';
import i18next from 'i18next';
import en from '../../public/locales/en/common.json';
import fr from '../../public/locales/fr/common.json';

// #471, FEAT-112 c1: « actif » is the internal name of a bottle or a cigar
// (design.md glossary), never a word the member reads. The adjective that
// describes something else stays; each such use is listed below, with its key.

const ADJECTIVAL_FR: Readonly<Record<string, string>> = {
  'wishlist.status.active': 'status of a wish (« Actif / Acquis / Annulé »), not a bottle',
  'adminConfig.network.summary.title': '« Résumé des paramètres actifs »: the settings in force',
  'adminConfig.network.summary.accessMode': '« Mode d\'accès actif »: the access mode in force',
};

function leaves(o: Record<string, unknown>, path = ''): [string, string][] {
  return Object.entries(o).flatMap(([k, v]) =>
    typeof v === 'string' ? [[`${path}${k}`, v] as [string, string]] : leaves(v as Record<string, unknown>, `${path}${k}.`),
  );
}

describe('vocabulary (FEAT-112)', () => {
  it('French never says « actif » outside the listed adjectival uses', () => {
    const found = leaves(fr).filter(([key, value]) => /(?<![\p{L}\p{N}])actifs?(?![\p{L}\p{N}])/iu.test(value) && !(key in ADJECTIVAL_FR)).map(([key]) => key);
    expect(found).toEqual([]);
  });

  it('English never says « asset »', () => {
    expect(leaves(en).filter(([, value]) => /(?<![\p{L}\p{N}])assets?(?![\p{L}\p{N}])/iu.test(value)).map(([key]) => key)).toEqual([]);
  });

  it('every listed adjectival use still exists and still says « actif » (the list stays honest)', () => {
    const all = new Map(leaves(fr));
    for (const key of Object.keys(ADJECTIVAL_FR)) {
      expect(all.get(key), key).toMatch(/(?<![\p{L}\p{N}])actifs?(?![\p{L}\p{N}])/iu);
    }
  });

  it('a member account reads « Activé » or « Désactivé » (c4)', () => {
    expect(fr.admin.users.statusEnabled).toBe('Activé');
    expect(fr.admin.users.statusDisabled).toBe('Désactivé');
  });

  it('speaks of the cigar, not the bottle, with the cigar context', async () => {
    const i = i18next.createInstance();
    await i.init({ lng: 'fr', resources: { fr: { common: fr } }, defaultNS: 'common', interpolation: { escapeValue: false } });
    expect(i.t('toast.createSuccess')).toBe('Bouteille ajoutée avec succès');
    expect(i.t('toast.createSuccess', { context: 'cigar' })).toBe('Cigare ajouté avec succès');
    expect(i.t('inventoryCount.report.choice.drunk', { count: 2 })).toBe('Bues');
    expect(i.t('inventoryCount.report.choice.drunk', { count: 2, context: 'cigar' })).toBe('Fumés');
    expect(i.t('inventoryCount.report.choice.drunk', { count: 1, context: 'cigar' })).toBe('Fumé');
    expect(i.t('inventoryCount.report.choice.written_off', { count: 2, context: 'box' })).toBe('Cassées / offertes / perdues');
  });

  it('totals that mix bottles and cigars use a neutral word, not "Bouteilles" (analytics)', () => {
    expect(fr.analytics.categories.active).toBe('En stock');
    expect(en.analytics.categories.active).toBe('In stock');
    for (const bundle of [fr, en]) {
      expect(bundle.analytics.maturity.countLabel_other).toBe('{{count}} ({{percent}}%)');
      expect(JSON.stringify(bundle.analytics.map.list)).not.toMatch(/bouteille|bottle/i);
    }
  });
});
