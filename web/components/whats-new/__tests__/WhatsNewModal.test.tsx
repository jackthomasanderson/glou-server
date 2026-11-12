import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import i18next, { type i18n as I18n } from 'i18next';
import type { ReleaseNotesView, ReleaseNote } from '@shared/release-notes';
import en from '../../../public/locales/en/common.json';
import fr from '../../../public/locales/fr/common.json';

// FEAT-115 (#990): what the What's New? window shows — every release missed,
// newest first and the only one expanded, sections in their fixed order with
// the empty ones hidden, the points of attention of several releases grouped
// at the top, in the interface language, with the installed version.

let i18n: I18n;
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, o?: Record<string, unknown>) => (i18n.t as unknown as (key: string, options?: Record<string, unknown>) => string)(k, o),
    i18n,
  }),
}));
vi.mock('@/hooks/useIsMobile', () => ({ useIsMobile: () => false }));

import { WhatsNewModal } from '../WhatsNewModal';

beforeAll(async () => {
  i18n = i18next.createInstance();
  await i18n.init({ lng: 'en', resources: { en: { common: en }, fr: { common: fr } }, defaultNS: 'common', interpolation: { escapeValue: false } });
});

beforeEach(async () => {
  await i18n.changeLanguage('en');
});

const note = (id: string, section: ReleaseNote['section'], seen = false): ReleaseNote => ({ id, section, text: { en: `${id} en`, fr: `${id} fr` }, seen });

const oneRelease: ReleaseNotesView = {
  currentVersion: '2026.12',
  releases: [{ version: '2026.12', notes: [note('fix', 'fixed'), note('feature', 'new'), note('warn', 'attention'), note('gone', 'removed')] }],
};

const threeMissed: ReleaseNotesView = {
  currentVersion: '2027.02',
  releases: [
    { version: '2027.02', notes: [note('feb-new', 'new'), note('feb-warn', 'attention')] },
    { version: '2027.01', notes: [note('jan-fix', 'fixed'), note('jan-warn', 'attention')] },
    { version: '2026.12', notes: [note('dec-sec', 'security')] },
  ],
};

const open = (view: ReleaseNotesView, mode: 'unseen' | 'all' = 'unseen', onClose = vi.fn()) =>
  render(<WhatsNewModal view={view} mode={mode} isOpen onClose={onClose} />);

const headingsIn = (el: HTMLElement) => within(el).queryAllByRole('heading').map((h) => h.textContent);

describe('WhatsNewModal (#990)', () => {
  it('is a dialog titled What\'s New? that gives the installed version', () => {
    open(oneRelease);
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('heading', { level: 2, name: 'What\'s New?' })).toBeInTheDocument();
    expect(dialog).toHaveTextContent('Installed version: 2026.12');
  });

  it('shows the sections in their fixed order and hides the empty ones', () => {
    open(oneRelease);
    expect(headingsIn(screen.getByRole('dialog')).slice(1)).toEqual(['Points of attention', 'New', 'Fixed', 'Removed']);
    expect(screen.getByText('warn en')).toBeInTheDocument();
  });

  it('shows every missed release, newest first and expanded, the older ones collapsed', () => {
    open(threeMissed);
    const toggles = screen.getAllByRole('button', { name: /^Version / });
    expect(toggles.map((b) => b.textContent)).toEqual(['Version 2027.02', 'Version 2027.01', 'Version 2026.12']);
    expect(toggles.map((b) => b.getAttribute('aria-expanded'))).toEqual(['true', 'false', 'false']);
    fireEvent.click(toggles[1]);
    expect(toggles[1]).toHaveAttribute('aria-expanded', 'true');
  });

  it('groups the points of attention of every missed release at the top, each with its version', () => {
    open(threeMissed);
    const attention = screen.getByRole('region', { name: 'Points of attention' });
    expect(within(attention).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['2027.02feb-warn en', '2027.01jan-warn en']);
    // Not repeated inside their release.
    expect(screen.getAllByText('feb-warn en')).toHaveLength(1);
  });

  it('opened by itself, shows only the notes not seen yet', () => {
    open({ currentVersion: '2026.12', releases: [
      { version: null, notes: [note('old-upcoming', 'new', true), note('new-upcoming', 'new')] },
      { version: '2026.12', notes: [note('seen-fix', 'fixed', true)] },
    ] });
    expect(screen.getByText('new-upcoming en')).toBeInTheDocument();
    expect(screen.queryByText('old-upcoming en')).not.toBeInTheDocument();
    expect(screen.queryByText('seen-fix en')).not.toBeInTheDocument();
  });

  it('reopened from a link, shows every release, seen or not; upcoming notes are named so', () => {
    open({ currentVersion: '2026.12', releases: [
      { version: null, notes: [note('upcoming', 'new', true)] },
      { version: '2026.12', notes: [note('seen-fix', 'fixed', true)] },
    ] }, 'all');
    expect(screen.getByRole('button', { name: 'Upcoming' })).toBeInTheDocument();
    expect(screen.getByText('upcoming en')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Version 2026.12' })).toBeInTheDocument();
  });

  it('names a lone release, so a beta admin sees the notes are not released yet', () => {
    open({ currentVersion: '2026.11.3', releases: [{ version: null, notes: [note('soon', 'new')] }] });
    expect(screen.getByText('Upcoming')).toBeInTheDocument();
    expect(screen.getByText('soon en')).toBeInTheDocument();
  });

  it('expands the newest missed release even when it only brings points of attention', () => {
    open({ currentVersion: '2027.02', releases: [
      { version: '2027.02', notes: [note('feb-warn', 'attention')] },
      { version: '2027.01', notes: [note('jan-fix', 'fixed')] },
    ] });
    const toggles = screen.getAllByRole('button', { name: /^Version / });
    expect(toggles.map((b) => b.textContent)).toEqual(['Version 2027.02', 'Version 2027.01']);
    expect(toggles.map((b) => b.getAttribute('aria-expanded'))).toEqual(['true', 'false']);
    expect(screen.getAllByText('feb-warn en')).toHaveLength(1);
  });

  it('says so when there is nothing to show', () => {
    open({ currentVersion: '2026.12', releases: [] }, 'all');
    expect(screen.getByText('No release notes for this version yet.')).toBeInTheDocument();
  });

  it('follows the interface language', async () => {
    await i18n.changeLanguage('fr');
    open(oneRelease);
    expect(screen.getByRole('heading', { level: 2 }).textContent).toMatch(/^Quoi de neuf/);
    expect(screen.getByText('fix fr')).toBeInTheDocument();
    expect(screen.queryByText('fix en')).not.toBeInTheDocument();
  });

  it.each([
    ['"Got it"', () => fireEvent.click(screen.getByRole('button', { name: 'Got it' }))],
    ['the close button', () => fireEvent.click(screen.getByRole('button', { name: /close/i }))],
    ['Escape', () => fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })],
  ])('closes with %s', (_label, close) => {
    const onClose = vi.fn();
    open(oneRelease, 'unseen', onClose);
    close();
    expect(onClose).toHaveBeenCalled();
  });
});
