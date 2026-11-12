// FEAT-115 (#990): release notes shown to administrators in the "What's New?"
// window. Import only from shared/.

/** The sections of a release, in the order the window shows them (empty ones hidden). */
export const RELEASE_NOTE_SECTIONS = ['attention', 'security', 'new', 'improved', 'fixed', 'removed'] as const;
export type ReleaseNoteSection = (typeof RELEASE_NOTE_SECTIONS)[number];

/** The languages every note is written in. */
export const RELEASE_NOTE_LANGUAGES = ['en', 'fr'] as const;
export type ReleaseNoteLanguage = (typeof RELEASE_NOTE_LANGUAGES)[number];

export interface ReleaseNote {
  /** Fingerprint of the normalised English text: the same whatever the language shown. */
  id: string;
  section: ReleaseNoteSection;
  text: Record<ReleaseNoteLanguage, string>;
  /** Already seen by this administrator (the window opens by itself only for unseen notes). */
  seen: boolean;
}

export interface ReleaseNotesRelease {
  /** CalVer without the leading "v" (`2026.12`, `2026.12.1`); null for the upcoming notes of a beta image. */
  version: string | null;
  /** In the file's order; the window groups them by section. */
  notes: ReleaseNote[];
}

/** Body of GET /api/admin/release-notes. */
export interface ReleaseNotesView {
  /** The installed version (`GET /api/version`). */
  currentVersion: string;
  /** Upcoming first, then the installed version and the older ones, newest first; never a release without notes. */
  releases: ReleaseNotesRelease[];
}
