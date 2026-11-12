'use client';
import React, { useId } from 'react';
import { Accordion, AccordionItem, Button, Chip, ModalBody, ModalContent, ModalFooter, ModalHeader } from '@heroui/react';
import { useTranslation } from 'react-i18next';
import { RELEASE_NOTE_SECTIONS, type ReleaseNote, type ReleaseNoteSection, type ReleaseNotesRelease, type ReleaseNotesView } from '@shared/release-notes';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { frenchSpaces } from '@/lib/frenchTypography';

/** `unseen`: opened by itself after an update; `all`: reopened from a link. */
export type WhatsNewMode = 'unseen' | 'all';

interface WhatsNewModalProps {
  view: ReleaseNotesView | undefined;
  mode: WhatsNewMode;
  isOpen: boolean;
  /** Every way out ("Got it", the close button, Escape, a click outside) calls it. */
  onClose: () => void;
  isError?: boolean;
}

const releaseKey = (release: ReleaseNotesRelease) => release.version ?? 'upcoming';

function useNoteText() {
  const { i18n } = useTranslation();
  // Plain text only (design.md): never HTML. The French spaces the app's own
  // texts get from i18next (« ? », « : ») are applied here too.
  return (note: ReleaseNote) => (i18n.language?.startsWith('fr') ? frenchSpaces(note.text.fr) : note.text.en);
}

function SectionList({ section, notes, Heading }: { section: ReleaseNoteSection; notes: ReleaseNote[]; Heading: 'h3' | 'h4' }) {
  const { t } = useTranslation();
  const text = useNoteText();
  return (
    <div>
      <Heading className="text-sm font-semibold text-foreground mb-1">{t(`whatsNew.sections.${section}`)}</Heading>
      <ul className="list-disc pl-5 space-y-1 text-sm text-foreground-600">
        {notes.map((note) => <li key={note.id}>{text(note)}</li>)}
      </ul>
    </div>
  );
}

/** The sections of one release, in their fixed order, empty ones left out; under the release's own heading when there is one. */
function ReleaseSections({ notes, Heading }: { notes: ReleaseNote[]; Heading: 'h3' | 'h4' }) {
  return (
    <div className="space-y-3">
      {RELEASE_NOTE_SECTIONS.map((section) => {
        const inSection = notes.filter((n) => n.section === section);
        return inSection.length > 0 ? <SectionList key={section} section={section} notes={inSection} Heading={Heading} /> : null;
      })}
    </div>
  );
}

/**
 * FEAT-115 (#990): the release notes an administrator has not seen yet (or
 * all of them, reopened from a link), newest release first and the only one
 * expanded. With several releases, their points of attention — what is left
 * to do after the update — are grouped at the top, each with its version.
 */
export function WhatsNewModal({ view, mode, isOpen, onClose, isError = false }: WhatsNewModalProps) {
  const { t } = useTranslation();
  const text = useNoteText();
  const attentionId = useId();

  const releases = (view?.releases ?? [])
    .map((r) => ({ ...r, notes: mode === 'unseen' ? r.notes.filter((n) => !n.seen) : r.notes }))
    .filter((r) => r.notes.length > 0);
  const label = (release: ReleaseNotesRelease) => (release.version === null ? t('whatsNew.upcoming') : t('whatsNew.version', { version: release.version }));
  const grouped = releases.length > 1;
  const attention = grouped ? releases.flatMap((r) => r.notes.filter((n) => n.section === 'attention').map((note) => ({ note, release: r }))) : [];
  const listed = grouped
    ? releases.map((r) => ({ ...r, notes: r.notes.filter((n) => n.section !== 'attention') })).filter((r) => r.notes.length > 0)
    : releases;

  return (
    <ResponsiveModal isOpen={isOpen} onClose={onClose} size="2xl" scrollBehavior="inside" radius="lg">
      <ModalContent>
        <ModalHeader className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold">{t('whatsNew.title')}</h2>
          {view && <p className="text-sm font-normal text-foreground-500">{t('whatsNew.installedVersion', { version: view.currentVersion })}</p>}
        </ModalHeader>
        <ModalBody className="space-y-4">
          {isError && <p className="text-sm text-danger">{t('whatsNew.loadError')}</p>}
          {!isError && view && releases.length === 0 && <p className="text-sm text-foreground-500">{t('whatsNew.empty')}</p>}

          {attention.length > 0 && (
            <section aria-labelledby={attentionId} className="rounded-lg border border-warning-200 bg-warning-50 p-3">
              <h3 id={attentionId} className="text-sm font-semibold text-foreground mb-2">{t('whatsNew.sections.attention')}</h3>
              <ul className="space-y-2 text-sm text-foreground">
                {attention.map(({ note, release }) => (
                  <li key={note.id} className="flex items-start gap-2">
                    <Chip size="sm" variant="flat" className="shrink-0">{release.version ?? t('whatsNew.upcoming')}</Chip>
                    <span>{text(note)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {listed.length === 1 && !grouped && <ReleaseSections notes={listed[0].notes} Heading="h3" />}
          {grouped && listed.length > 0 && (
            <Accordion selectionMode="multiple" defaultExpandedKeys={[releaseKey(listed[0])]} variant="splitted" className="px-0">
              {listed.map((release) => (
                <AccordionItem key={releaseKey(release)} title={label(release)} aria-label={label(release)} HeadingComponent="h3">
                  <ReleaseSections notes={release.notes} Heading="h4" />
                </AccordionItem>
              ))}
            </Accordion>
          )}
        </ModalBody>
        <ModalFooter>
          <Button color="primary" variant="solid" onPress={onClose}>{t('whatsNew.gotIt')}</Button>
        </ModalFooter>
      </ModalContent>
    </ResponsiveModal>
  );
}
