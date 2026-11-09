import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { MaturityReference } from '@/hooks/useAdmin';

// #765: the one line explaining the rule order reads as an instruction (body
// size, full-contrast text), and #698: on a phone the rules are cards, not a
// table to scroll sideways.

let isMobile = false;
let refs: MaturityReference[] = [];
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
vi.mock('@/hooks/useIsMobile', () => ({ useIsMobile: () => isMobile }));
vi.mock('@/hooks/useAdmin', () => ({
  useMaturityReferences: () => ({ data: refs, isLoading: false }),
  useCreateMaturityReference: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateMaturityReference: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteMaturityReference: () => ({ mutate: vi.fn() }),
  useReorderMaturityReferences: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/components/ui/ResponsiveModal', () => ({ ResponsiveModal: () => null }));

import { MaturityReferencesSection } from '../MaturityReferencesSection';

const ref = (id: string, name: string): MaturityReference => ({
  id, name, category: 'wine', mode: 'RELATIVE', windowFrom: 5, windowTo: 15, curveShape: 'LINEAR',
  region: 'Bordeaux', color: null, producer: null, vintageFrom: null, vintageTo: null, priority: 1, bottleCount: 3,
} as MaturityReference);

describe('MaturityReferencesSection', () => {
  it('shows the rule-order hint at body size in full-contrast text (#765)', () => {
    refs = [];
    render(<MaturityReferencesSection />);
    const hint = screen.getByText('admin.maturityRefs.cascadeHint');
    const box = hint.closest('p') as HTMLElement;
    expect(box.className).toMatch(/\btext-sm\b/);
    expect(box.className).toMatch(/\btext-foreground\b/);
    expect(box.className).not.toMatch(/text-foreground-[1-4]00|\btext-xs\b/);
  });

  it('lists the rules as cards on a phone, with their actions (#698)', () => {
    refs = [ref('r1', 'Bordeaux reds'), ref('r2', 'All reds')];
    isMobile = true;
    render(<MaturityReferencesSection />);
    expect(screen.queryByRole('grid')).toBeNull();
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('Bordeaux reds');
    expect(items[0].querySelector('[aria-label="actions.edit"]')).not.toBeNull();
    expect(items[0].querySelector('[aria-label="admin.maturityRefs.moveDown"]')).not.toBeNull();
    isMobile = false;
  });
});
