import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

const OFF_CATEGORY: Record<string, string> = {
  wine: 'en:wines',
  sparkling: 'en:champagnes-and-sparkling-wines',
  spirit: 'en:spirits',
  cigar: '',
};

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
      page_size: '8',
      fields: 'product_name,brands',
    });

    const offCategory = OFF_CATEGORY[category] ?? '';
    if (offCategory) {
      params.set('tagtype_0', 'categories');
      params.set('tag_contains_0', 'contains');
      params.set('tag_0', offCategory);
    }

    const response = await fetch(
      `https://world.openfoodfacts.org/cgi/search.pl?${params.toString()}`,
      {
        signal: AbortSignal.timeout(5000),
        headers: { 'User-Agent': 'Glou-Server/1.0 (self-hosted cellar app)' },
      }
    );

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

export default router;
