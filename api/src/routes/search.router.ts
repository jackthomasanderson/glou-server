import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

// Prefixes injected before the user query to scope Google suggestions
const PRODUCT_PREFIX: Record<string, string> = {
  wine: 'vin',
  sparkling: 'champagne',
  spirit: 'whisky',
  cigar: 'cigare',
};

const PRODUCER_PREFIX: Record<string, string> = {
  wine: 'château',
  sparkling: 'maison',
  spirit: 'distillerie',
  cigar: 'manufacture',
};

async function googleSuggest(query: string): Promise<string[]> {
  const url = `https://suggestqueries.google.com/complete/search?client=firefox&q=${encodeURIComponent(query)}&hl=fr`;
  const res = await fetch(url, {
    signal: AbortSignal.timeout(3000),
    headers: { 'User-Agent': 'Mozilla/5.0' },
  });
  if (!res.ok) return [];
  // Returns [queryString, [suggestion1, suggestion2, ...], ...]
  const json = (await res.json()) as [string, string[]];
  return json[1] ?? [];
}

// GET /api/search/products?q=...&category=...
// Returns product name suggestions scoped to the item category
router.get('/products', authMiddleware, async (req, res) => {
  const q = String(req.query.q ?? '').trim();
  const category = String(req.query.category ?? '');

  if (!q || q.length < 2) return res.json({ data: [] });

  try {
    const prefix = PRODUCT_PREFIX[category] ?? 'vin';
    const suggestions = await googleSuggest(`${prefix} ${q}`);

    const seen = new Set<string>();
    const results = suggestions
      .map((s) => {
        // Strip the prefix we added so the suggestion shows just the product name
        const lower = s.toLowerCase();
        const stripped = lower.startsWith(`${prefix} `)
          ? s.slice(prefix.length + 1).trim()
          : s.trim();
        return stripped;
      })
      .filter((s) => {
        if (!s || seen.has(s.toLowerCase())) return false;
        seen.add(s.toLowerCase());
        return true;
      })
      .slice(0, 6)
      .map((name) => ({
        source: 'external',
        name,
        producer: '',
        category,
      }));

    res.json({ data: results });
  } catch {
    res.json({ data: [] });
  }
});

// GET /api/search/producers?q=...&category=...
// Returns producer/brand name suggestions scoped to the item category
router.get('/producers', authMiddleware, async (req, res) => {
  const q = String(req.query.q ?? '').trim();
  const category = String(req.query.category ?? '');

  if (!q || q.length < 2) return res.json({ data: [] });

  try {
    const prefix = PRODUCER_PREFIX[category] ?? 'château';
    const suggestions = await googleSuggest(`${prefix} ${q}`);

    const seen = new Set<string>();
    const results = suggestions
      .map((s) => {
        const lower = s.toLowerCase();
        return lower.startsWith(`${prefix} `)
          ? s.slice(prefix.length + 1).trim()
          : s.trim();
      })
      .filter((s) => {
        if (!s || seen.has(s.toLowerCase())) return false;
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
