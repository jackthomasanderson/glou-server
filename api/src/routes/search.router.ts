import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

const OFF_CATEGORY: Record<string, string> = {
  wine: 'en:wines',
  sparkling: 'en:champagnes-and-sparkling-wines',
  spirit: 'en:spirits',
  cigar: '',
};

async function fetchOFF(params: URLSearchParams): Promise<Response> {
  return fetch(
    `https://world.openfoodfacts.org/cgi/search.pl?${params.toString()}`,
    {
      signal: AbortSignal.timeout(5000),
      headers: { 'User-Agent': 'Glou-Server/1.0 (self-hosted cellar app)' },
    }
  );
}

// GET /api/search/products?q=...&category=...
router.get('/products', authMiddleware, async (req, res) => {
  const q = String(req.query.q ?? '').trim();
  const category = String(req.query.category ?? '');

  if (!q || q.length < 2) return res.json({ data: [] });

  try {
    const params = new URLSearchParams({
      search_terms: q,
      search_simple: '1',
      action: 'process',
      json: '1',
      page_size: '10',
      fields: 'product_name,brands',
    });

    const offCategory = OFF_CATEGORY[category] ?? '';
    if (offCategory) {
      params.set('tagtype_0', 'categories');
      params.set('tag_contains_0', 'contains');
      params.set('tag_0', offCategory);
    }

    const response = await fetchOFF(params);
    if (!response.ok) return res.json({ data: [] });

    const json = (await response.json()) as {
      products?: Array<{ product_name?: string; brands?: string }>;
    };

    const seen = new Set<string>();
    const results = (json.products ?? [])
      .filter((p) => {
        const name = p.product_name?.trim();
        if (!name || seen.has(name.toLowerCase())) return false;
        seen.add(name.toLowerCase());
        return true;
      })
      .map((p) => ({
        source: 'external',
        name: p.product_name!.trim(),
        producer: p.brands?.split(',')[0]?.trim() ?? '',
        category,
      }))
      .slice(0, 6);

    res.json({ data: results });
  } catch {
    res.json({ data: [] });
  }
});

// GET /api/search/producers?q=...&category=...
router.get('/producers', authMiddleware, async (req, res) => {
  const q = String(req.query.q ?? '').trim();
  const category = String(req.query.category ?? '');

  if (!q || q.length < 2) return res.json({ data: [] });

  try {
    const params = new URLSearchParams({
      search_terms: q,
      search_simple: '1',
      action: 'process',
      json: '1',
      page_size: '12',
      fields: 'brands',
    });

    const offCategory = OFF_CATEGORY[category] ?? '';
    if (offCategory) {
      params.set('tagtype_0', 'categories');
      params.set('tag_contains_0', 'contains');
      params.set('tag_0', offCategory);
    }

    const response = await fetchOFF(params);
    if (!response.ok) return res.json({ data: [] });

    const json = (await response.json()) as {
      products?: Array<{ brands?: string }>;
    };

    const qLower = q.toLowerCase();
    const seen = new Set<string>();
    const results: string[] = [];

    for (const p of json.products ?? []) {
      if (!p.brands) continue;
      for (const brand of p.brands.split(',')) {
        const b = brand.trim();
        if (!b || !b.toLowerCase().includes(qLower) || seen.has(b.toLowerCase())) continue;
        seen.add(b.toLowerCase());
        results.push(b);
        if (results.length >= 6) break;
      }
      if (results.length >= 6) break;
    }

    res.json({ data: results });
  } catch {
    res.json({ data: [] });
  }
});

export default router;
