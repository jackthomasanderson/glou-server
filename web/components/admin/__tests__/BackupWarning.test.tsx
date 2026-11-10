import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ReactNode } from 'react';
import i18next, { type i18n as I18n } from 'i18next';
import en from '../../../public/locales/en/common.json';

// #756: with automatic backups off, or no backup that ever succeeded, the top
// of the admin page says so and opens the Backups tab.

let i18n: I18n;
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, o?: Record<string, unknown>) => (i18n.t as unknown as (k: string, o?: unknown) => string)(k, o),
    i18n: { language: 'en' },
  }),
}));
vi.mock('@heroui/react', () => ({
  Button: ({ children, onPress }: { children?: ReactNode; onPress?: () => void }) => (
    <button type="button" onClick={onPress}>{children}</button>
  ),
}));

import { BackupWarning, BackupMarker, LastBackupNote, backupAlerts, backupProblems } from '../BackupWarning';

beforeAll(async () => {
  i18n = i18next.createInstance();
  await i18n.init({ lng: 'en', resources: { en: { common: en } }, defaultNS: 'common', interpolation: { escapeValue: false } });
});

const health = (patch: Partial<{ backupEnabled: boolean; lastSuccessAt: string | null; lastRunFailed: boolean; overdue: boolean }>) => ({
  directoryWritable: true, backupEnabled: true, lastSuccessAt: '2026-11-08T03:00:00.000Z', ...patch,
});

describe('backupProblems (#756)', () => {
  it('finds nothing while the state is unknown or when backups run and one succeeded', () => {
    expect(backupProblems(undefined)).toEqual([]);
    expect(backupProblems(health({}))).toEqual([]);
  });
  it('names each problem', () => {
    expect(backupProblems(health({ backupEnabled: false }))).toEqual(['disabled']);
    expect(backupProblems(health({ lastSuccessAt: null }))).toEqual(['noBackup']);
    expect(backupProblems(health({ backupEnabled: false, lastSuccessAt: null }))).toEqual(['disabled', 'noBackup']);
    expect(backupProblems({ ...health({}), directoryWritable: false })).toEqual(['notWritable']);
  });
  // #671: also said in the banner shown to administrators on every page.
  it('names a failed last run and an overdue backup, and keeps them as the alerts', () => {
    expect(backupProblems(health({ lastRunFailed: true }))).toEqual(['failed']);
    expect(backupProblems(health({ overdue: true }))).toEqual(['overdue']);
    expect(backupProblems({ ...health({ lastRunFailed: true, overdue: true, backupEnabled: false }), directoryWritable: false }))
      .toEqual(['notWritable', 'failed', 'overdue', 'disabled']);
    expect(backupAlerts({ ...health({ lastRunFailed: true, overdue: true, backupEnabled: false }), directoryWritable: false }))
      .toEqual(['failed', 'overdue']);
    expect(backupAlerts(health({ backupEnabled: false, lastSuccessAt: null }))).toEqual([]);
    expect(backupAlerts(undefined)).toEqual([]);
  });
  it('claims nothing the API could not read', () => {
    expect(backupProblems({ directoryWritable: true })).toEqual([]);
  });
});

describe('BackupWarning (#756)', () => {
  it('warns that automatic backups are off, and opens the Backups tab', () => {
    const open = vi.fn();
    render(<BackupWarning problems={backupProblems(health({ backupEnabled: false }))} onOpenBackups={open} />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Automatic backups are switched off');
    expect(alert).not.toHaveTextContent('No backup has ever succeeded');
    fireEvent.click(screen.getByRole('button', { name: 'Open backups' }));
    expect(open).toHaveBeenCalledOnce();
  });

  it('warns that no backup ever succeeded', () => {
    render(<BackupWarning problems={backupProblems(health({ lastSuccessAt: null }))} onOpenBackups={() => {}} />);
    expect(screen.getByRole('alert')).toHaveTextContent('No backup has ever succeeded');
    expect(screen.getByRole('alert')).not.toHaveTextContent('switched off');
  });

  it('warns that the backups folder cannot be written to', () => {
    render(<BackupWarning problems={['notWritable']} onOpenBackups={() => {}} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Glou cannot write to the backups folder');
  });

  it('warns that the last backup failed, and that none succeeded for two days (#671)', () => {
    render(<BackupWarning problems={['failed', 'overdue']} onOpenBackups={() => {}} />);
    expect(screen.getByRole('alert')).toHaveTextContent('The last backup failed');
    expect(screen.getByRole('alert')).toHaveTextContent('No backup has succeeded for more than two days');
  });

  it('shows nothing when backups are fine', () => {
    const { container } = render(<BackupWarning problems={[]} onOpenBackups={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('the tab marker has an accessible name, not colour alone', () => {
    render(<BackupMarker />);
    expect(screen.getByRole('img', { name: 'Needs attention: no up-to-date backup' })).toBeInTheDocument();
  });
});

describe('LastBackupNote, in the purge confirmation (#756)', () => {
  it('gives the date of the last successful backup', () => {
    render(<LastBackupNote health={health({})} />);
    expect(screen.getByText(/^Last successful backup: .*2026/)).toBeInTheDocument();
  });

  it('says there is none, and that automatic backups are off', () => {
    render(<LastBackupNote health={health({ backupEnabled: false, lastSuccessAt: null })} />);
    expect(screen.getByText(/No backup has succeeded yet\. Automatic backups are switched off\./)).toBeInTheDocument();
  });
});
