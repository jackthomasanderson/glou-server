import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { assertUrlAllowed, resolveSafeUrl } from '../lib/ssrf';

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

const PRODUCTS_UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'products');
if (!fs.existsSync(PRODUCTS_UPLOAD_DIR)) {
  fs.mkdirSync(PRODUCTS_UPLOAD_DIR, { recursive: true });
}

const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/pjpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
};

function extFromUrl(url: string): string | null {
  try {
    const raw = path.extname(new URL(url).pathname).replace('.', '').toLowerCase();
    const map: Record<string, string> = { jpg: 'jpg', jpeg: 'jpg', png: 'png', webp: 'webp', gif: 'gif', avif: 'avif' };
    return map[raw] ?? null;
  } catch {
    return null;
  }
}

const productImageUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, PRODUCTS_UPLOAD_DIR),
    filename: (_req, _file, cb) => {
      const ext = path.extname(_file.originalname).toLowerCase() || '.jpg';
      cb(null, `${crypto.randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/') && file.mimetype !== 'image/svg+xml') {
      cb(null, true);
    } else {
      cb(new Error('INVALID_FILE_TYPE'));
    }
  },
});

// GET /api/search/images?q=...
router.get('/images', authMiddleware, async (req, res) => {
  const q = String(req.query.q ?? '').trim();
  if (!q || q.length < 2) return res.json({ data: [] });

  try {
    // Step 1: get vqd token from DuckDuckGo
    const initRes = await fetch(
      `https://duckduckgo.com/?q=${encodeURIComponent(q)}&iax=images&ia=images`,
      {
        signal: AbortSignal.timeout(5000),
        headers: {
          'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
        },
      }
    );
    if (!initRes.ok) return res.json({ data: [] });
    const html = await initRes.text();

    const vqdMatch = html.match(/vqd=['"]?([^'"&\s]+)/);
    if (!vqdMatch) return res.json({ data: [] });
    const vqd = vqdMatch[1];

    // Step 2: fetch image results
    const imgUrl = new URL('https://duckduckgo.com/i.js');
    imgUrl.searchParams.set('l', 'fr-fr');
    imgUrl.searchParams.set('o', 'json');
    imgUrl.searchParams.set('q', q);
    imgUrl.searchParams.set('vqd', vqd);
    imgUrl.searchParams.set('f', ',,,,,');
    imgUrl.searchParams.set('p', '1');

    const imgRes = await fetch(imgUrl.toString(), {
      signal: AbortSignal.timeout(5000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Referer': 'https://duckduckgo.com/',
        'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
      },
    });
    if (!imgRes.ok) return res.json({ data: [] });

    const json = (await imgRes.json()) as {
      results?: Array<{ image: string; thumbnail: string; title: string }>;
    };

    const results = (json.results ?? [])
      .filter((r) => r.image?.startsWith('https://') && r.thumbnail?.startsWith('https://'))
      .slice(0, 8)
      .map((r) => ({ url: r.image, thumb: r.thumbnail, title: r.title ?? '' }));

    res.json({ data: results });
  } catch {
    res.json({ data: [] });
  }
});

// POST /api/search/images/save — download an image URL and store it locally
router.post('/images/save', authMiddleware, async (req, res) => {
  const url = String(req.body?.url ?? '').trim();

  if (!url.startsWith('https://')) {
    return res.status(400).json({ error: 'INVALID_URL' });
  }

  try {
    // Fast reject before any network call; resolveSafeUrl re-checks this plus
    // every redirect hop (DNS-resolved, against all IANA special-use ranges),
    // so an authenticated member cannot use this endpoint as an SSRF pivot
    // into the Docker network (e.g. a remote host 3xx-redirecting to
    // http://ollama:11434/...).
    await assertUrlAllowed(url);

    const response = await resolveSafeUrl(url, {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
    });

    if (!response.ok) return res.status(502).json({ error: 'FETCH_FAILED' });

    const rawType = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() ?? '';
    const ext = ALLOWED_IMAGE_TYPES[rawType] ?? extFromUrl(url);
    if (!ext) return res.status(422).json({ error: 'INVALID_IMAGE_TYPE' });

    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > 5 * 1024 * 1024) {
      return res.status(413).json({ error: 'IMAGE_TOO_LARGE' });
    }

    const filename = `${crypto.randomUUID()}.${ext}`;
    fs.writeFileSync(path.join(PRODUCTS_UPLOAD_DIR, filename), Buffer.from(buffer));

    res.json({ data: { path: `/uploads/products/${filename}` } });
  } catch {
    res.status(502).json({ error: 'FETCH_FAILED' });
  }
});

// POST /api/search/images/upload — store a file upload locally
router.post('/images/upload', authMiddleware, productImageUpload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'NO_FILE' });
  res.json({ data: { path: `/uploads/products/${req.file.filename}` } });
});

export default router;
