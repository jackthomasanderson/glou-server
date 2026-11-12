import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import {
  RELEASE_NOTE_SECTIONS,
  type ReleaseNoteLanguage,
  type ReleaseNoteSection,
  type ReleaseNotesView,
} from '../../../shared/release-notes';

/**
 * FEAT-115 (#990): the release notes behind the administrators' "What's New?"
 * window, from `release-notes/RELEASE_NOTES.en.md` and `.fr.md` (design.md,
 * "Notes de version"). A home-made line parser, no Markdown dependency:
 *
 *   ## Upcoming            (## À venir)  — first, may be empty
 *   ## vYYYY.MM[.PATCH]    newest first
 *   ### <section>          one of SECTION_HEADINGS below, any order
 *   - one note per bullet, on one line, plain text
 *
 * Text before the first `##` is free (title, instructions for contributors).
 */

const SECTION_HEADINGS: Record<ReleaseNoteLanguage, Record<string, ReleaseNoteSection>> = {
  en: {
    'Points of attention': 'attention',
    Security: 'security',
    New: 'new',
    Improved: 'improved',
    Fixed: 'fixed',
    Removed: 'removed',
  },
  fr: {
    "Points d'attention": 'attention',
    'Points d’attention': 'attention',
    Sécurité: 'security',
    Nouveautés: 'new',
    Améliorations: 'improved',
    Corrections: 'fixed',
    Retiré: 'removed',
  },
};

const UPCOMING_HEADING: Record<ReleaseNoteLanguage, string> = { en: 'Upcoming', fr: 'À venir' };

const CALVER = /^v?(\d{4})\.(\d{1,2})(?:\.(\d+))?$/;

/** `[year, month, patch]` of a CalVer version (`2026.12`, `v2026.12.1`), null if it is not one. */
export function parseCalVer(version: string): [number, number, number] | null {
  const match = CALVER.exec(version.trim());
  if (!match) return null;
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return [Number(match[1]), month, Number(match[3] ?? 0)];
}

/** Negative, zero or positive like a sort comparator; both must be CalVer versions. */
export function compareCalVer(a: string, b: string): number {
  const pa = parseCalVer(a);
  const pb = parseCalVer(b);
  if (!pa || !pb) throw new Error(`Not a CalVer version: ${pa ? b : a}`);
  for (let i = 0; i < 3; i += 1) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}

/** Same id for the same note whatever the language shown: the English text, normalised. */
export function noteId(englishText: string): string {
  const normalised = englishText.trim().replace(/\s+/g, ' ');
  return crypto.createHash('sha256').update(normalised).digest('hex').slice(0, 16);
}

export interface ParsedRelease {
  /** Without the leading "v"; null for the upcoming notes. */
  version: string | null;
  notes: Array<{ section: ReleaseNoteSection; text: string }>;
}

export interface ParsedReleaseNotes {
  releases: ParsedRelease[];
  /** Every line the format refuses, with its number. Empty for a valid file. */
  errors: string[];
}

export function parseReleaseNotes(markdown: string, lang: ReleaseNoteLanguage): ParsedReleaseNotes {
  const releases: ParsedRelease[] = [];
  const errors: string[] = [];
  let release: ParsedRelease | null = null;
  // Lines under a refused heading are skipped: one error, not one per line.
  let skippingRelease = false;
  let section: ReleaseNoteSection | null = null;
  let skippingSection = false;
  let started = false;

  markdown.split(/\r?\n/).forEach((raw, index) => {
    const line = raw.trim();
    const at = `line ${index + 1}`;
    if (line.startsWith('## ')) {
      started = true;
      section = null;
      skippingSection = false;
      const heading = line.slice(3).trim();
      const version = heading === UPCOMING_HEADING[lang] ? null : heading.startsWith('v') && parseCalVer(heading) ? heading.slice(1) : undefined;
      if (version === undefined) {
        errors.push(`${at}: "${heading}" is neither "${UPCOMING_HEADING[lang]}" nor vYYYY.MM[.PATCH]`);
        release = null;
        skippingRelease = true;
        return;
      }
      skippingRelease = false;
      if (version === null && releases.length > 0) errors.push(`${at}: "${heading}" must be the first release`);
      const previous = [...releases].reverse().find((r) => r.version !== null);
      if (version !== null && previous?.version && compareCalVer(version, previous.version) >= 0) {
        errors.push(`${at}: v${version} must come after v${previous.version} (newest first, once each)`);
      }
      release = { version, notes: [] };
      releases.push(release);
      return;
    }
    if (!started || skippingRelease || line === '') return;
    if (line.startsWith('### ')) {
      const heading = line.slice(4).trim();
      const known = SECTION_HEADINGS[lang][heading];
      if (!known) {
        errors.push(`${at}: unknown section "${heading}" (${Object.keys(SECTION_HEADINGS[lang]).join(', ')})`);
        section = null;
        skippingSection = true;
        return;
      }
      section = known;
      skippingSection = false;
      return;
    }
    if (line.startsWith('- ')) {
      if (skippingSection) return;
      if (!section || !release) {
        errors.push(`${at}: a note must be under a "### <section>" heading`);
        return;
      }
      release.notes.push({ section, text: line.slice(2).trim() });
      return;
    }
    errors.push(`${at}: only "## <release>", "### <section>" and "- <note>" lines are allowed`);
  });

  return { releases, errors };
}

const releaseLabel = (version: string | null) => (version === null ? 'Upcoming' : `v${version}`);

/** The notes of a release counted by section: the shape both languages must share. */
function sectionCounts(release: ParsedRelease): Map<ReleaseNoteSection, number> {
  const counts = new Map<ReleaseNoteSection, number>();
  for (const note of release.notes) counts.set(note.section, (counts.get(note.section) ?? 0) + 1);
  return counts;
}

/** What differs between the English and the French files: releases, sections, number of notes. */
export function releaseNotesShapeDifferences(en: ParsedReleaseNotes, fr: ParsedReleaseNotes): string[] {
  const differences: string[] = [];
  const enVersions = en.releases.map((r) => releaseLabel(r.version));
  const frVersions = fr.releases.map((r) => releaseLabel(r.version));
  if (enVersions.join() !== frVersions.join()) {
    differences.push(`releases differ: en [${enVersions.join(', ')}], fr [${frVersions.join(', ')}]`);
  }
  for (const enRelease of en.releases) {
    const frRelease = fr.releases.find((r) => r.version === enRelease.version);
    if (!frRelease) continue;
    const enCounts = sectionCounts(enRelease);
    const frCounts = sectionCounts(frRelease);
    for (const section of RELEASE_NOTE_SECTIONS) {
      const e = enCounts.get(section) ?? 0;
      const f = frCounts.get(section) ?? 0;
      if (e !== f) differences.push(`${releaseLabel(enRelease.version)} ${section}: ${e} note(s) in en, ${f} in fr`);
    }
  }
  return differences;
}

export interface CatalogNote {
  id: string;
  section: ReleaseNoteSection;
  text: Record<ReleaseNoteLanguage, string>;
}

export interface ReleaseNotesCatalog {
  releases: Array<{ version: string | null; notes: CatalogNote[] }>;
}

/**
 * The English file gives the releases and the ids; each note takes the French
 * text found at the same place (release, section, rank), else its English one.
 */
export function buildCatalog(en: ParsedReleaseNotes, fr: ParsedReleaseNotes): ReleaseNotesCatalog {
  return {
    releases: en.releases.map((release) => {
      const french = fr.releases.find((r) => r.version === release.version)?.notes ?? [];
      const rank = new Map<ReleaseNoteSection, number>();
      return {
        version: release.version,
        notes: release.notes.map(({ section, text }) => {
          const i = rank.get(section) ?? 0;
          rank.set(section, i + 1);
          const frText = french.filter((n) => n.section === section)[i]?.text ?? text;
          return { id: noteId(text), section, text: { en: text, fr: frText } };
        }),
      };
    }),
  };
}

/**
 * Reads both files of `dir`. A missing or unreadable file means no notes (the
 * window never opens), a malformed line is skipped: neither stops the API.
 * Both are logged — the CI test on the shipped files keeps them from happening.
 */
export function loadReleaseNotes(dir: string): ReleaseNotesCatalog {
  const read = (lang: ReleaseNoteLanguage) => {
    const file = path.join(dir, `RELEASE_NOTES.${lang}.md`);
    const parsed = parseReleaseNotes(fs.readFileSync(file, 'utf8'), lang);
    if (parsed.errors.length > 0) console.warn(`[release-notes] ${file}: ${parsed.errors.join('; ')}`);
    return parsed;
  };
  try {
    return buildCatalog(read('en'), read('fr'));
  } catch (error) {
    console.warn('[release-notes] no release notes:', error instanceof Error ? error.message : error);
    return { releases: [] };
  }
}

/**
 * Read once at start-up from the working directory — the package root however
 * the API runs (Docker WORKDIR /app, `npm run dev`, vitest), like package.json
 * in app-version.ts. The image copies `release-notes/` there (api/Dockerfile).
 */
export const RELEASE_NOTES = loadReleaseNotes(path.join(process.cwd(), 'release-notes'));

/** What an administrator has already seen (`User.lastSeenReleaseVersion`, `User.seenReleaseNoteIds`). */
export interface ReleaseNotesSeenState {
  lastSeenReleaseVersion: string | null;
  seenReleaseNoteIds: string[];
}

function isSeen(version: string | null, id: string, state: ReleaseNotesSeenState): boolean {
  if (state.seenReleaseNoteIds.includes(id)) return true;
  if (version === null || !state.lastSeenReleaseVersion || !parseCalVer(state.lastSeenReleaseVersion)) return false;
  return compareCalVer(version, state.lastSeenReleaseVersion) <= 0;
}

/**
 * The notes of the installed version and the older ones, newest first, after
 * the upcoming ones (a beta image); each says whether this administrator has
 * seen it. A release without notes is left out. An unreadable installed
 * version cannot be compared: every numbered release is shown.
 */
export function releaseNotesView(catalog: ReleaseNotesCatalog, currentVersion: string, state: ReleaseNotesSeenState): ReleaseNotesView {
  const installed = parseCalVer(currentVersion) ? currentVersion : null;
  return {
    currentVersion,
    releases: catalog.releases
      .filter((r) => r.notes.length > 0)
      .filter((r) => r.version === null || installed === null || compareCalVer(r.version, installed) <= 0)
      .map((r) => ({
        version: r.version,
        notes: r.notes.map((n) => ({ ...n, seen: isSeen(r.version, n.id, state) })),
      })),
  };
}

/**
 * Everything installed counts as seen: written when the window is closed, when
 * the first administrator is created and when a member is made administrator
 * (design.md, "Dernière version vue"). The ids kept are the upcoming notes'
 * only, so the list stays bounded by one section.
 */
export function seenStateNow(catalog: ReleaseNotesCatalog, currentVersion: string): ReleaseNotesSeenState {
  const newestNumbered = catalog.releases.find((r) => r.version !== null)?.version ?? null;
  return {
    lastSeenReleaseVersion: parseCalVer(currentVersion) ? currentVersion : newestNumbered,
    seenReleaseNoteIds: catalog.releases.find((r) => r.version === null)?.notes.map((n) => n.id) ?? [],
  };
}
