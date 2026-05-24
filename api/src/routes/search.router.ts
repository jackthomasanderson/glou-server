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

function extractVintage(s: string): { name: string; vintage: number | null } {
  const match = s.match(/\b((19|20)\d{2})\b/);
  if (!match) return { name: s.trim(), vintage: null };
  const year = parseInt(match[1], 10);
  const name = s.replace(match[0], '').replace(/\s{2,}/g, ' ').trim();
  return { name, vintage: year };
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
        return lower.startsWith(`${prefix} `)
          ? s.slice(prefix.length + 1).trim()
          : s.trim();
      })
      .filter((s) => {
        if (!s || seen.has(s.toLowerCase()) || isCommercial(s)) return false;
        seen.add(s.toLowerCase());
        return true;
      })
      .slice(0, 6)
      .map((raw) => {
        const { name, vintage } = extractVintage(raw);
        return { source: 'external', name: toTitleCase(name), producer: '', category, vintage };
      });

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

// GET /api/search/images?q=...
router.get('/images', authMiddleware, async (req, res) => {
  const q = String(req.query.q ?? '').trim();
  if (!q || q.length < 2) return res.json({ data: [] });

  try {
    const url = new URL('https://commons.wikimedia.org/w/api.php');
    url.searchParams.set('action', 'query');
    url.searchParams.set('generator', 'search');
    url.searchParams.set('gsrsearch', q);
    url.searchParams.set('gsrnamespace', '6');
    url.searchParams.set('prop', 'imageinfo');
    url.searchParams.set('iiprop', 'url|thumburl');
    url.searchParams.set('iiurlwidth', '200');
    url.searchParams.set('format', 'json');
    url.searchParams.set('gsrlimit', '8');

    const response = await fetch(url.toString(), {
      signal: AbortSignal.timeout(5000),
      headers: { 'User-Agent': 'Glou/1.0 (wine cellar management app)' },
    });

    if (!response.ok) return res.json({ data: [] });

    const json = (await response.json()) as {
      query?: {
        pages?: Record<string, {
          title: string;
          imageinfo?: Array<{ url: string; thumburl: string }>;
        }>;
      };
    };

    const pages = json.query?.pages ?? {};
    const results = Object.values(pages)
      .filter((p) => p.imageinfo?.[0]?.url && p.imageinfo?.[0]?.thumburl)
      .map((p) => ({
        url: p.imageinfo![0].url,
        thumb: p.imageinfo![0].thumburl,
        title: p.title.replace(/^File:/, '').replace(/\.[^.]+$/, ''),
      }))
      .slice(0, 8);

    res.json({ data: results });
  } catch {
    res.json({ data: [] });
  }
});

export default router;
