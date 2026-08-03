import { z } from 'zod';

// ─── FEAT-04: Scan Étiquette & Ajout Express — Vision/OCR via Ollama ─────────
// Self-hosted, privacy-respecting vision LLM (design.md "Services OCR ...
// Traitement asynchrone (Job Queue)" — no third-party image upload). Model:
// `moondream` (moondream2, ~1.8B params) via the local Ollama REST API
// (`/api/generate`), reachable at `OLLAMA_URL` (defaults to the in-compose
// service name, see docker-compose.yml). The model is pulled once at compose
// startup by the `ollama-pull` service — see that file for details.

const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://ollama:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? 'moondream';

// Vision models on CPU (typical home-lab hardware) can take tens of seconds
// per image — generous timeout, the client polls asynchronously anyway.
const OLLAMA_TIMEOUT_MS = 120_000;

export const ocrExtractedDataSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  producer: z.string().min(1).max(200).optional(),
  vintage: z.number().int().min(1000).max(2100).optional(),
  category: z.enum(['wine', 'sparkling', 'spirit', 'cigar']).optional(),
  contenance: z.string().max(50).optional(),
});

export type OcrExtractedData = z.infer<typeof ocrExtractedDataSchema>;

const PROMPT = `You are looking at a photo of a wine, spirit, or cigar label. Extract the following information and respond with ONLY a single JSON object, no other text, no markdown code fences:
{
  "name": string or null — the product/cuvée name,
  "producer": string or null — the producer/domain/distillery/brand,
  "vintage": number or null — the vintage year (4 digits) if visible,
  "category": one of "wine", "sparkling", "spirit", "cigar", or null,
  "contenance": string or null — the volume/size as printed (e.g. "75cl", "70cl", "50cl")
}
If a field is not visible or you are unsure, use null for that field. Do not guess. Respond with JSON only.`;

/**
 * Extracts the first balanced `{...}` block from a string, tolerant of the
 * model wrapping its JSON in prose or markdown code fences (small vision
 * models frequently do). Returns `null` if no valid JSON object is found.
 */
export function extractFirstJsonBlock(text: string): unknown {
  const start = text.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escapeNext = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }
    if (ch === '\\' && inString) {
      escapeNext = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (ch === '{') depth++;
    if (ch === '}') {
      depth--;
      if (depth === 0) {
        const candidate = text.slice(start, i + 1);
        try {
          return JSON.parse(candidate);
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

const CATEGORY_ALIASES: Record<string, OcrExtractedData['category']> = {
  wine: 'wine', vin: 'wine', red: 'wine', white: 'wine', rouge: 'wine', blanc: 'wine', rosé: 'wine', rose: 'wine',
  sparkling: 'sparkling', champagne: 'sparkling', crémant: 'sparkling', cremant: 'sparkling', prosecco: 'sparkling', cava: 'sparkling',
  spirit: 'spirit', spiritueux: 'spirit', whisky: 'spirit', whiskey: 'spirit', rhum: 'spirit', rum: 'spirit', gin: 'spirit', cognac: 'spirit', vodka: 'spirit',
  cigar: 'cigar', cigare: 'cigar',
};

/**
 * Best-effort normalization of the raw parsed JSON into our known shape:
 * coerces loose types (vintage as a numeric string, category free text) and
 * drops anything that still doesn't fit, rather than failing the whole
 * extraction because of one bad field.
 */
function normalizeRawExtraction(raw: unknown): OcrExtractedData {
  if (!raw || typeof raw !== 'object') return {};
  const obj = raw as Record<string, unknown>;
  const result: OcrExtractedData = {};

  if (typeof obj.name === 'string' && obj.name.trim()) result.name = obj.name.trim().slice(0, 200);
  if (typeof obj.producer === 'string' && obj.producer.trim()) result.producer = obj.producer.trim().slice(0, 200);

  const rawVintage = obj.vintage;
  const vintageNum = typeof rawVintage === 'number' ? rawVintage : typeof rawVintage === 'string' ? parseInt(rawVintage, 10) : NaN;
  if (Number.isInteger(vintageNum) && vintageNum >= 1000 && vintageNum <= 2100) result.vintage = vintageNum;

  const rawCategory = typeof obj.category === 'string' ? obj.category.trim().toLowerCase() : null;
  if (rawCategory) {
    const mapped = CATEGORY_ALIASES[rawCategory];
    if (mapped) result.category = mapped;
  }

  if (typeof obj.contenance === 'string' && obj.contenance.trim()) result.contenance = obj.contenance.trim().slice(0, 50);

  const parsed = ocrExtractedDataSchema.safeParse(result);
  return parsed.success ? parsed.data : {};
}

/**
 * Sends the label photo to the local Ollama vision model and returns the
 * best-effort extracted fields. Never throws for a "the model returned
 * garbage" case — returns `{}` instead so the caller (scan.service.ts) can
 * still surface a "done" job with an empty/partial form for manual entry.
 * Only throws for actual infrastructure failures (Ollama unreachable, HTTP
 * error, timeout) so the job is correctly marked 'failed' in that case.
 */
export async function analyzeLabelImage(imageBase64: string): Promise<OcrExtractedData> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt: PROMPT,
        images: [imageBase64],
        stream: false,
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    throw new Error(`OLLAMA_REQUEST_FAILED_${res.status}`);
  }

  const body = (await res.json()) as { response?: string };
  const rawText = body.response ?? '';
  const jsonBlock = extractFirstJsonBlock(rawText);
  return normalizeRawExtraction(jsonBlock);
}
