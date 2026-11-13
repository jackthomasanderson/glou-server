import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { assertUrlAllowed, resolveSafeUrl } from '../lib/ssrf';
import { AppError } from '../lib/errors';
import { ALLOWED_IMAGE_TYPES, inspectImage } from '../lib/upload';
import { verifyStoredImage } from '../middleware/upload.middleware';
import { isCommercial, PRODUCER_EXTRA_TERMS } from '../lib/suggest-filter';

const router = Router();

const PRODUCT_PREFIX: Record<string, Record<string, string>> = {
  fr: { wine: 'vin', sparkling: 'champagne', spirit: 'whisky', cigar: 'cigare' },
  en: { wine: 'wine', sparkling: 'champagne', spirit: 'whisky', cigar: 'cigar' },
};

const PRODUCER_PREFIX: Record<string, Record<string, string>> = {
  fr: { wine: 'château', sparkling: 'maison', spirit: 'distillerie', cigar: 'manufacture' },
  en: { wine: 'winery', sparkling: 'house', spirit: 'distillery', cigar: 'manufacturer' },
};

// #862: what the photo suggestion looks for, added to "producer name" — alone,
// an uncommon or made-up name returned anything ("ZZ" is a ball-bearing code).
const IMAGE_SUBJECT: Record<string, string> = {
  wine: 'wine bottle', sparkling: 'champagne bottle', spirit: 'bottle', cigar: 'cigar',
};

function toTitleCase(s: string): string {
  // Capitalize first letter after start, spaces, and hyphens
  return s.replace(/(^|[\s-])([a-zàâäéèêëîïôùûüæœç])/g, (_, sep, char) =>
    sep + char.toUpperCase()
  );
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
  } catch (error) {
    // Best-effort enrichment: an empty list is a valid answer, but the upstream
    // failure still has to be visible in the logs (ISSUE_063).
    console.warn('[search] product suggestions unavailable:', error);
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
  } catch (error) {
    console.warn('[search] producer suggestions unavailable:', error);
    res.json({ data: [] });
  }
});

const PRODUCTS_UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'products');
if (!fs.existsSync(PRODUCTS_UPLOAD_DIR)) {
  fs.mkdirSync(PRODUCTS_UPLOAD_DIR, { recursive: true });
}

const productImageUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, PRODUCTS_UPLOAD_DIR),
    // ISSUE_049: the extension must come from the validated mimetype, never
    // from the client-supplied filename — a file declared `image/png` but
    // named `x.html` would otherwise be stored (and served as-is by
    // express.static) with the client's own extension.
    filename: (_req, file, cb) => {
      const ext = ALLOWED_IMAGE_TYPES[file.mimetype.toLowerCase()] ?? 'jpg';
      cb(null, `${crypto.randomUUID()}.${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.toLowerCase() in ALLOWED_IMAGE_TYPES) {
      cb(null, true);
    } else {
      cb(new AppError(400, 'INVALID_FILE_TYPE'));
    }
  },
});

/** #862: answers that are surely a page, not an image. */
const NOT_AN_IMAGE_TYPES = new Set(['text/html', 'application/xhtml+xml', 'application/json']);

// GET /api/search/images?q=...&category=...
// ISSUE_228: scrapes DuckDuckGo's image search HTML/JSON endpoints — there is
// no official image-search API this project uses instead. That's a known,
// accepted risk: it can break without notice on a DuckDuckGo-side change
// (the `unavailable: true` flag and the console.warn calls below exist so a
// breakage is visible rather than silently returning zero results), and
// scraping outside DuckDuckGo's own search UI may not sit well with their
// terms of service. Decision (per #228): keep it as is rather than replace
// it with Wikimedia Commons or a paid API; this comment is what documents
// the risk. If it breaks for good, the source can simply be cut — callers
// already treat `unavailable`/an empty `data` as "no image results", not an
// error.
router.get('/images', authMiddleware, async (req, res) => {
  const typed = String(req.query.q ?? '').trim();
  if (!typed || typed.length < 2) return res.json({ data: [] });
  // A manual search (no category) is sent as typed.
  const subject = IMAGE_SUBJECT[String(req.query.category ?? '')];
  const q = subject ? `${typed} ${subject}` : typed;

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
    if (!initRes.ok) {
      console.warn('[search] image search unavailable: init request status', initRes.status);
      return res.json({ data: [], unavailable: true });
    }
    const html = await initRes.text();

    const vqdMatch = html.match(/vqd=['"]?([^'"&\s]+)/);
    if (!vqdMatch) {
      console.warn('[search] image search unavailable: vqd token not found');
      return res.json({ data: [], unavailable: true });
    }
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
    if (!imgRes.ok) {
      console.warn('[search] image search unavailable: i.js request status', imgRes.status);
      return res.json({ data: [], unavailable: true });
    }

    const json = (await imgRes.json()) as {
      results?: Array<{ image: string; thumbnail: string; title: string }>;
    };

    const results = (json.results ?? [])
      .filter((r) => r.image?.startsWith('https://') && r.thumbnail?.startsWith('https://'))
      .slice(0, 8)
      .map((r) => ({ url: r.image, thumb: r.thumbnail, title: r.title ?? '' }));

    res.json({ data: results });
  } catch (error) {
    console.warn('[search] image search unavailable:', error);
    res.json({ data: [], unavailable: true });
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

    // #862: a page (hotlink protection, an error) is refused before it is
    // read; any other answer, even mislabelled, is judged on its bytes below.
    const rawType = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() ?? '';
    if (NOT_AN_IMAGE_TYPES.has(rawType)) return res.status(422).json({ error: 'INVALID_IMAGE_TYPE' });

    const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
    const declaredLength = Number(response.headers.get('content-length'));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_IMAGE_BYTES) {
      return res.status(413).json({ error: 'IMAGE_TOO_LARGE' });
    }

    if (!response.body) return res.status(502).json({ error: 'FETCH_FAILED' });

    const chunks: Buffer[] = [];
    let total = 0;
    const reader = response.body.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_IMAGE_BYTES) {
          await reader.cancel();
          return res.status(413).json({ error: 'IMAGE_TOO_LARGE' });
        }
        chunks.push(Buffer.from(value));
      }
    } finally {
      reader.releaseLock?.();
    }

    // #862, #886: only a file whose bytes are those of an image, readable to
    // its end, is stored, under the extension of what it really is: a broken
    // photo (a page, a download cut short) is never attached.
    const bytes = Buffer.concat(chunks);
    const inspection = await inspectImage(bytes);
    if (!inspection.ok) {
      return res.status(422).json({ error: inspection.reason === 'DAMAGED' ? 'IMAGE_DAMAGED' : 'INVALID_IMAGE_TYPE' });
    }

    const filename = `${crypto.randomUUID()}.${inspection.ext}`;
    fs.writeFileSync(path.join(PRODUCTS_UPLOAD_DIR, filename), bytes);

    res.json({ data: { path: `/uploads/products/${filename}` } });
  } catch (error) {
    // Covers both an SSRF rejection and an unreachable host — the distinction is
    // deliberately not exposed to the caller, only logged.
    console.warn('[search] image download failed:', error);
    res.status(502).json({ error: 'FETCH_FAILED' });
  }
});

// POST /api/search/images/upload — store a file upload locally
router.post('/images/upload', authMiddleware, productImageUpload.single('image'), verifyStoredImage, (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'NO_FILE' });
  res.json({ data: { path: `/uploads/products/${req.file.filename}` } });
});

export default router;
