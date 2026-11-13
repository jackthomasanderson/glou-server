import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  parseCalVer,
  compareCalVer,
  parseReleaseNotes,
  releaseNotesShapeDifferences,
  buildCatalog,
  loadReleaseNotes,
  releaseNotesView,
  seenStateNow,
  noteId,
} from '../../src/lib/release-notes';

// FEAT-115 (#990): the bilingual release notes behind the "What's New?"
// window — the line parser, CalVer comparison, what counts as seen.

const EN = `# Glou release notes

Free text before the first release is ignored.

## Upcoming

### New
- Upcoming feature.

## v2026.12.1

### Fixed
- A fix.

## v2026.12

### Fixed
- An older fix.

### Points of attention
- Everyone signs in again.

### New
- The What's New? window.
- Another feature.

## v2026.11

### Security
- A security fix.
`;

const FR = `# Notes de version de Glou

## À venir

### Nouveautés
- Fonction à venir.

## v2026.12.1

### Corrections
- Une correction.

## v2026.12

### Corrections
- Une correction plus ancienne.

### Points d'attention
- Tout le monde se reconnecte.

### Nouveautés
- La fenêtre Quoi de neuf ?
- Une autre fonction.

## v2026.11

### Sécurité
- Un correctif de sécurité.
`;

const catalog = () => buildCatalog(parseReleaseNotes(EN, 'en'), parseReleaseNotes(FR, 'fr'));

describe('CalVer (#990)', () => {
  it('reads YYYY.MM and YYYY.MM.PATCH, with or without the leading v', () => {
    expect(parseCalVer('2026.12')).toEqual([2026, 12, 0]);
    expect(parseCalVer('v2026.12.3')).toEqual([2026, 12, 3]);
    expect(parseCalVer('unknown')).toBeNull();
    expect(parseCalVer('2026.13')).toBeNull();
    expect(parseCalVer('2026.1x')).toBeNull();
  });

  it('compares part by part, as numbers', () => {
    expect(compareCalVer('2026.9', '2026.10')).toBeLessThan(0);
    expect(compareCalVer('2026.10.10', '2026.10.9')).toBeGreaterThan(0);
    expect(compareCalVer('2026.11', '2026.11.0')).toBe(0);
    expect(compareCalVer('2027.01', '2026.12.5')).toBeGreaterThan(0);
  });
});

describe('parseReleaseNotes (#990)', () => {
  it('reads the releases, their sections and one note per bullet', () => {
    const parsed = parseReleaseNotes(EN, 'en');
    expect(parsed.errors).toEqual([]);
    expect(parsed.releases.map((r) => r.version)).toEqual([null, '2026.12.1', '2026.12', '2026.11']);
    expect(parsed.releases[2].notes).toEqual([
      { section: 'fixed', text: 'An older fix.' },
      { section: 'attention', text: 'Everyone signs in again.' },
      { section: 'new', text: 'The What\'s New? window.' },
      { section: 'new', text: 'Another feature.' },
    ]);
  });

  it('reads the French headings', () => {
    const parsed = parseReleaseNotes(FR, 'fr');
    expect(parsed.errors).toEqual([]);
    expect(parsed.releases[2].notes.map((n) => n.section)).toEqual(['fixed', 'attention', 'new', 'new']);
    expect(parsed.releases[3].notes[0]).toEqual({ section: 'security', text: 'Un correctif de sécurité.' });
  });

  it('reports an unknown section, a bullet outside a section, stray text and a bad version heading', () => {
    const parsed = parseReleaseNotes('## v2026.12\n- orphan\n### Misc\n- x\nstray text\n## Next\n- y\n', 'en');
    expect(parsed.errors).toHaveLength(4);
  });

  it('reports releases out of order, and upcoming notes not at the top', () => {
    expect(parseReleaseNotes('## v2026.11\n## v2026.12\n', 'en').errors).toHaveLength(1);
    expect(parseReleaseNotes('## v2026.12\n## Upcoming\n', 'en').errors).toHaveLength(1);
  });

  it('accepts an empty upcoming section (a stable image)', () => {
    const parsed = parseReleaseNotes('## Upcoming\n\n## v2026.12\n### New\n- x\n', 'en');
    expect(parsed.errors).toEqual([]);
    expect(parsed.releases[0]).toEqual({ version: null, notes: [] });
  });
});

describe('releaseNotesShapeDifferences (#990)', () => {
  it('finds nothing when both languages match', () => {
    expect(releaseNotesShapeDifferences(parseReleaseNotes(EN, 'en'), parseReleaseNotes(FR, 'fr'))).toEqual([]);
  });

  it('finds a missing note, a missing section and a missing release', () => {
    const fr = FR.replace('- Une autre fonction.\n', '').replace('### Sécurité\n- Un correctif de sécurité.\n', '');
    expect(releaseNotesShapeDifferences(parseReleaseNotes(EN, 'en'), parseReleaseNotes(fr, 'fr')).length).toBeGreaterThanOrEqual(2);
    const noRelease = FR.replace(/## v2026\.11\n[\s\S]*$/, '');
    expect(releaseNotesShapeDifferences(parseReleaseNotes(EN, 'en'), parseReleaseNotes(noRelease, 'fr'))).not.toEqual([]);
  });
});

describe('buildCatalog (#990)', () => {
  it('pairs each English note with its French text, its id taken from the English text', () => {
    const notes = catalog().releases[2].notes;
    expect(notes[2]).toEqual({ id: noteId('The What\'s New? window.'), section: 'new', text: { en: 'The What\'s New? window.', fr: 'La fenêtre Quoi de neuf ?' } });
  });

  it('gives the same id to the same text whatever its spacing', () => {
    expect(noteId(' A  fix.\t')).toBe(noteId('A fix.'));
    expect(noteId('A fix.')).not.toBe(noteId('Another fix.'));
  });

  it('falls back to the English text when the French note is missing', () => {
    const built = buildCatalog(parseReleaseNotes(EN, 'en'), parseReleaseNotes('', 'fr'));
    expect(built.releases[1].notes[0].text).toEqual({ en: 'A fix.', fr: 'A fix.' });
  });
});

describe('loadReleaseNotes (#990)', () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  afterEach(() => warn.mockClear());

  it('loads both files of a folder', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'release-notes-'));
    fs.writeFileSync(path.join(dir, 'RELEASE_NOTES.en.md'), EN);
    fs.writeFileSync(path.join(dir, 'RELEASE_NOTES.fr.md'), FR);
    expect(loadReleaseNotes(dir)).toEqual(catalog());
    fs.rmSync(dir, { recursive: true });
  });

  it('gives no notes, and warns, when the files are missing', () => {
    expect(loadReleaseNotes(path.join(os.tmpdir(), 'no-such-release-notes'))).toEqual({ releases: [] });
    expect(warn).toHaveBeenCalled();
  });
});

describe('releaseNotesView (#990)', () => {
  const never = { lastSeenReleaseVersion: null, seenReleaseNoteIds: [] };

  it('shows upcoming notes then the installed version and older ones, newest first, all unseen for a new admin', () => {
    const view = releaseNotesView(catalog(), '2026.12', never);
    expect(view.currentVersion).toBe('2026.12');
    // 2026.12.1 is not installed yet: not shown.
    expect(view.releases.map((r) => r.version)).toEqual([null, '2026.12', '2026.11']);
    expect(view.releases.every((r) => r.notes.every((n) => !n.seen))).toBe(true);
  });

  it('counts a note as seen when its version is at most the last one seen', () => {
    const view = releaseNotesView(catalog(), '2026.12.1', { lastSeenReleaseVersion: '2026.12', seenReleaseNoteIds: [] });
    const seen = Object.fromEntries(view.releases.map((r) => [r.version ?? 'upcoming', r.notes.map((n) => n.seen)]));
    expect(seen).toEqual({ upcoming: [false], '2026.12.1': [false], '2026.12': [true, true, true, true], '2026.11': [true] });
  });

  it('counts an upcoming note as seen by its id, so only a new one makes the window come back', () => {
    const upcomingId = noteId('Upcoming feature.');
    const view = releaseNotesView(catalog(), '2026.12.1', { lastSeenReleaseVersion: '2026.12.1', seenReleaseNoteIds: [upcomingId] });
    expect(view.releases.flatMap((r) => r.notes).every((n) => n.seen)).toBe(true);
  });

  it('counts a released note seen while it was upcoming as seen, though its version is newer', () => {
    const view = releaseNotesView(catalog(), '2026.12.1', { lastSeenReleaseVersion: '2026.12', seenReleaseNoteIds: [noteId('A fix.')] });
    expect(view.releases.find((r) => r.version === '2026.12.1')?.notes[0].seen).toBe(true);
  });

  it('hides a release with no notes, and has nothing for a version missing from the file', () => {
    const view = releaseNotesView(buildCatalog(parseReleaseNotes('## Upcoming\n\n## v2026.11\n### New\n- x\n', 'en'), parseReleaseNotes('', 'fr')), '2026.12', never);
    expect(view.releases.map((r) => r.version)).toEqual(['2026.11']);
  });

  it('shows every numbered release when the installed version is unreadable', () => {
    expect(releaseNotesView(catalog(), 'unknown', never).releases.map((r) => r.version)).toEqual([null, '2026.12.1', '2026.12', '2026.11']);
  });
});

describe('seenStateNow (#990)', () => {
  it('is the installed version plus the upcoming notes present', () => {
    expect(seenStateNow(catalog(), '2026.12')).toEqual({ lastSeenReleaseVersion: '2026.12', seenReleaseNoteIds: [noteId('Upcoming feature.')] });
  });

  it('falls back to the newest numbered release when the installed version is unreadable', () => {
    expect(seenStateNow(catalog(), 'unknown').lastSeenReleaseVersion).toBe('2026.12.1');
    expect(seenStateNow({ releases: [] }, 'unknown')).toEqual({ lastSeenReleaseVersion: null, seenReleaseNoteIds: [] });
  });
});

// design.md "Notes de version": the CI check of the shipped files — same
// releases, sections and number of notes in both languages, valid headings.
describe('shipped release notes (api/release-notes/)', () => {
  const dir = path.join(__dirname, '../../release-notes');
  const read = (lang: 'en' | 'fr') => parseReleaseNotes(fs.readFileSync(path.join(dir, `RELEASE_NOTES.${lang}.md`), 'utf8'), lang);

  it.each(['en', 'fr'] as const)('RELEASE_NOTES.%s.md has valid headings and bullets', (lang) => {
    expect(read(lang).errors).toEqual([]);
  });

  it('has the same releases, sections and number of notes in English and French', () => {
    expect(releaseNotesShapeDifferences(read('en'), read('fr'))).toEqual([]);
  });

  it('starts with the upcoming section', () => {
    expect(read('en').releases[0]?.version).toBeNull();
  });
});
