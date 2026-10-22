import { z } from 'zod';
import { categorySchema } from '../lib/category';
import type { ScanFailureCode } from '../../../shared/scan';

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
// per image (plus model load time on the first request) — generous timeout,
// the client polls asynchronously anyway. Override with OLLAMA_TIMEOUT_MS.
const DEFAULT_OLLAMA_TIMEOUT_MS = 600_000;
const parsedTimeout = Number(process.env.OLLAMA_TIMEOUT_MS);
const OLLAMA_TIMEOUT_MS = Number.isFinite(parsedTimeout) && parsedTimeout > 0 ? parsedTimeout : DEFAULT_OLLAMA_TIMEOUT_MS;

// #639: the `ollama` service only runs with `--profile scan`. The availability
// probe gates every scan entry point, so it must answer fast when the host does
// not resolve, and is cached so a page load does not hit the service each time.
const AVAILABILITY_TIMEOUT_MS = 3_000;
const AVAILABILITY_CACHE_MS = 30_000;

/** A scan failure whose cause can be told to the user. */
export class OcrError extends Error {
  constructor(public readonly code: ScanFailureCode, cause?: unknown) {
    super(code, { cause });
    this.name = 'OcrError';
  }
}

// Node's fetch gives up by itself after 300 s without response headers
// (undici's headersTimeout), before a longer OLLAMA_TIMEOUT_MS fires; Ollama
// sends nothing until the analysis is over (`stream: false`).
const FETCH_TIMEOUT_CODES = new Set(['UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT']);

function isFetchTimeout(error: unknown): boolean {
  const cause = error instanceof Error ? error.cause : undefined;
  return typeof cause === 'object' && cause !== null && 'code' in cause && FETCH_TIMEOUT_CODES.has(String(cause.code));
}

// The in-flight or settled probe: concurrent checks share it, and a reset
// cannot be overwritten by a probe started before it.
let availabilityProbe: { result: Promise<boolean>; startedAt: number } | null = null;

/** Ollama lists `moondream` as `moondream:latest`; a tag in OLLAMA_MODEL must match exactly. */
function isConfiguredModel(name: string): boolean {
  return OLLAMA_MODEL.includes(':') ? name === OLLAMA_MODEL : name === OLLAMA_MODEL || name.startsWith(`${OLLAMA_MODEL}:`);
}

/**
 * True when the recognition service answers and the vision model is already
 * pulled (`ollama-pull` downloads it after the first start, ~1.7 GB).
 */
export function isScanAvailable(): Promise<boolean> {
  if (availabilityProbe && Date.now() - availabilityProbe.startedAt < AVAILABILITY_CACHE_MS) {
    return availabilityProbe.result;
  }
  availabilityProbe = { result: probeScanService(), startedAt: Date.now() };
  return availabilityProbe.result;
}

async function probeScanService(): Promise<boolean> {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(AVAILABILITY_TIMEOUT_MS) });
    if (!res.ok) return false;
    const body = (await res.json()) as { models?: { name?: unknown }[] };
    return (body.models ?? []).some((m) => typeof m.name === 'string' && isConfiguredModel(m.name));
  } catch {
    return false;
  }
}

/** Forgets the cached probe, so the next scan request re-checks the service. */
export function resetScanAvailabilityCache(): void {
  availabilityProbe = null;
}

export const ocrExtractedDataSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  producer: z.string().min(1).max(200).optional(),
  vintage: z.number().int().min(1000).max(2100).optional(),
  category: categorySchema.optional(),
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
 * Only throws, as an `OcrError`, for actual infrastructure failures (Ollama
 * unreachable, HTTP error, timeout) so the job is correctly marked 'failed'
 * with a cause the user can be told (#639).
 */
export async function analyzeLabelImage(imageBase64: string): Promise<OcrExtractedData> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);
  // Surface timeouts explicitly instead of a bare "AbortError" (#319).
  const timeoutError = () => new OcrError('SCAN_TIMEOUT', new Error(`OLLAMA_TIMEOUT_AFTER_${OLLAMA_TIMEOUT_MS}MS`));

  let body: { response?: string };
  try {
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
    } catch (error) {
      if (controller.signal.aborted || isFetchTimeout(error)) throw timeoutError();
      resetScanAvailabilityCache();
      throw new OcrError('SCAN_UNAVAILABLE', error);
    }

    if (!res.ok) {
      // 404: the model is not pulled yet. 502-504: a proxy in front of a stopped service.
      const unavailable = res.status === 404 || (res.status >= 502 && res.status <= 504);
      if (unavailable) resetScanAvailabilityCache();
      throw new OcrError(unavailable ? 'SCAN_UNAVAILABLE' : 'SCAN_FAILED', new Error(`OLLAMA_REQUEST_FAILED_${res.status}`));
    }

    try {
      body = (await res.json()) as { response?: string };
    } catch (error) {
      throw controller.signal.aborted || isFetchTimeout(error) ? timeoutError() : new OcrError('SCAN_FAILED', error);
    }
  } finally {
    clearTimeout(timeout);
  }

  const rawText = body.response ?? '';
  const jsonBlock = extractFirstJsonBlock(rawText);
  const extracted = normalizeRawExtraction(jsonBlock);

  // This case (model replied, but nothing usable came out of it) never
  // throws — see the doc comment above — so it would otherwise be
  // invisible: the job still ends up 'done', just with an empty form, and
  // nobody could tell whether that's because the label truly had no
  // readable text or because the model's output didn't parse. Log the raw
  // response (truncated: `rawText` can be arbitrarily long/binary-ish) so
  // that's diagnosable from the server logs, per #292.
  if (Object.keys(extracted).length === 0) {
    console.warn(`[ocr] No usable fields extracted from model response: ${rawText.slice(0, 300)}`);
  }

  return extracted;
}
