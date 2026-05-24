import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

const PRODUCT_PREFIX: Record<string, Record<string, string>> = {
  fr: { wine: 'vin', sparkling: 'champagne', spirit: 'whisky', cigar: 'cigare' },
  en: { wine: 'wine', sparkling: 'champagne', spirit: 'whisky', cigar: 'cigar' },
};

const PRODUCER_PREFIX: Record<string, Record<string, string>> = {
  fr: { wine: 'château', sparkling: 'maison', spirit: 'distillerie', cigar: 'manufacture' },
  en: { wine: 'winery', sparkling: 'house', spirit: 'distillery', cigar: 'manufacturer' },
};

// Commercial / non-product terms to reject from suggestions
const COMMERCIAL_TERMS = [
  'prix', 'price', 'tarif', 'avis', 'review', 'note', 'guide', 'fiche',
  'achat', 'buy', 'order', 'shop', 'boutique', 'livraison', 'delivery',
  'amazon', 'leclerc', 'carrefour', 'fnac', 'promo', 'solde', 'occasion',
  'vente', 'sale', 'stock', 'disponible', 'available', 'recette', 'recipe',
];

// Extra terms to reject specifically for producer suggestions
const PRODUCER_EXTRA_TERMS = [
  'rouge', 'blanc', 'rosé', 'rose', 'orange', 'brut', 'sec', 'demi',
  'red', 'white', 'sparkling', 'vintage', 'reserve', 'réserve',
];

function toTitleCase(s: string): string {
  // Capitalize first letter after start, spaces, and hyphens
  return s.replace(/(^|[\s-])([a-zàâäéèêëîïôùûüæœç])/g, (_, sep, char) =>
    sep + char.toUpperCase()
  );
}

function isCommercial(s: string, extraTerms: string[] = []): boolean {
  const lower = s.toLowerCase();
  return [...COMMERCIAL_TERMS, ...extraTerms].some((t) => lower.includes(t));
}

function hasYear(s: string): boolean {
  return /\b(19|20)\d{2}\b/.test(s);
}

async function googleSuggest(query: string, lang: string): Promise<string[]> {
  const hl = lang === 'en' ? 'en' : 'fr';
  const url = `https://suggestqueries.google.com/complete/search?client=firefox&q=${encodeURIComponent(query)}&hl=${hl}`;
  const res = await fetch(url, {
    signal: AbortSignal.timeout(3000),
    headers: { 'User-Agent': 'Mozilla/5.0' },
  });
  if (!res.ok) return [];
  const json = (await res.json()) as [string, string[]];
  return json[1] ?? [];
}

// GET /api/search/products?q=...&category=...&lang=fr|en
router.get('/products', authMiddleware, async (req, res) => {
  const q = String(req.query.q ?? '').trim();
  const category = String(req.query.category ?? '');
  const lang = String(req.query.lang ?? 'fr') === 'en' ? 'en' : 'fr';

  if (!q || q.length < 2) return res.json({ data: [] });

  try {
    const prefix = PRODUCT_PREFIX[lang][category] ?? (lang === 'en' ? 'wine' : 'vin');
    const suggestions = await googleSuggest(`${prefix} ${q}`, lang);

    const seen = new Set<string>();
    const results = suggestions
      .map((s) => {
        const lower = s.toLowerCase();
        const stripped = lower.startsWith(`${prefix} `)
          ? s.slice(prefix.length + 1).trim()
          : s.trim();
        return toTitleCase(stripped);
      })
      .filter((s) => {
        if (!s || seen.has(s.toLowerCase()) || isCommercial(s)) return false;
        seen.add(s.toLowerCase());
        return true;
      })
      .slice(0, 6)
      .map((name) => ({ source: 'external', name, producer: '', category }));

    res.json({ data: results });
  } catch {
    res.json({ data: [] });
  }
});

// GET /api/search/producers?q=...&category=...&lang=fr|en
router.get('/producers', authMiddleware, async (req, res) => {
  const q = String(req.query.q ?? '').trim();
  const category = String(req.query.category ?? '');
  const lang = String(req.query.lang ?? 'fr') === 'en' ? 'en' : 'fr';

  if (!q || q.length < 2) return res.json({ data: [] });

  try {
    const prefix = PRODUCER_PREFIX[lang][category] ?? (lang === 'en' ? 'winery' : 'château');
    const suggestions = await googleSuggest(`${prefix} ${q}`, lang);

    const seen = new Set<string>();
    const results = suggestions
      .map((s) => {
        const lower = s.toLowerCase();
        return lower.startsWith(`${prefix} `)
          ? toTitleCase(s.slice(prefix.length + 1).trim())
          : toTitleCase(s.trim());
      })
      .filter((s) => {
        if (!s || seen.has(s.toLowerCase())) return false;
        if (isCommercial(s, PRODUCER_EXTRA_TERMS)) return false;
        if (hasYear(s)) return false; // producers don't have vintages
        seen.add(s.toLowerCase());
        return true;
      })
      .slice(0, 6);

    res.json({ data: results });
  } catch {
    res.json({ data: [] });
  }
});

export default router;
