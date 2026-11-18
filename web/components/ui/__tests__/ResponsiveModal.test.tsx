import { beforeAll, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ModalContent, ModalBody } from '@heroui/react';
import { frenchT } from '@/lib/products/__tests__/i18n';

// #1041: HeroUI labels the close button "Close"; in the French UI it says "Fermer".

let t: Awaited<ReturnType<typeof frenchT>>;
beforeAll(async () => { t = await frenchT(); });

vi.mock('@/hooks/useIsMobile', () => ({ useIsMobile: () => true }));
vi.mock('react-i18next', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-i18next')>()),
  useTranslation: () => ({ t: (key: string) => t(key), i18n: { language: 'fr' } }),
}));

import { ResponsiveModal } from '../ResponsiveModal';

describe('ResponsiveModal close button', () => {
  it('is named in the app language and still closes the dialog', () => {
    const onClose = vi.fn();
    render(
      <ResponsiveModal isOpen onClose={onClose}>
        <ModalContent><ModalBody>content</ModalBody></ModalContent>
      </ResponsiveModal>,
    );
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
    const close = screen.getByRole('button', { name: 'Fermer' });
    close.click();
    expect(onClose).toHaveBeenCalled();
  });

  it('has a 44 px hit area on a phone', () => {
    render(
      <ResponsiveModal isOpen onClose={() => {}}>
        <ModalContent><ModalBody>content</ModalBody></ModalContent>
      </ResponsiveModal>,
    );
    // p-3.5 around the 16 px icon = 44 px.
    expect(screen.getByRole('button', { name: 'Fermer' }).className).toContain('max-sm:p-3.5');
  });
});
