import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { CELLAR_TYPES } from '@/lib/cellars/types';

// #685: going back to the cellar step after creating one showed an empty form,
// and filling it in created a second cellar for the whole household.

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string, o?: Record<string, unknown>) => (o?.name ? `${k}|${o.name}` : k) }),
}));
const createCellar = vi.fn();
vi.mock('@/hooks/useCellars', () => ({ useCreateCellar: () => ({ mutate: createCellar, isPending: false }) }));

import { CellarStep } from '../steps/CellarStep';

const onCreated = vi.fn();
const onContinue = vi.fn();

beforeEach(() => vi.clearAllMocks());

describe('CellarStep with the wizard cellar already created (#685)', () => {
  it('shows that cellar and continues, instead of offering to create another one', () => {
    render(
      <CellarStep existingCellar={{ name: 'Cave à vin' }} onCreated={onCreated} onContinue={onContinue} onSkip={() => {}} onBack={() => {}} />,
    );
    expect(screen.getByText('onboarding.cellar.existing|Cave à vin')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'onboarding.cellar.createCta' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'onboarding.cellar.continue' }));
    expect(onContinue).toHaveBeenCalledOnce();
    expect(createCellar).not.toHaveBeenCalled();
  });

  it('still offers to create one when the wizard has no cellar yet', () => {
    render(<CellarStep existingCellar={null} onCreated={onCreated} onContinue={onContinue} onSkip={() => {}} onBack={() => {}} />);
    expect(screen.getByRole('button', { name: 'onboarding.cellar.createCta' })).toBeInTheDocument();
  });
});

// #649: the wizard had its own hand-written list of types, without the humidor.
describe('CellarStep cellar types (#649)', () => {
  it('lists every cellar type the cellars page offers, humidor included', () => {
    render(<CellarStep existingCellar={null} onCreated={onCreated} onContinue={onContinue} onSkip={() => {}} onBack={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /cellars\.type/ }));
    const offered = screen.getAllByRole('option').map((option) => option.textContent);
    expect(offered).toEqual(CELLAR_TYPES.map((type) => `cellars.types.${type}`));
    expect(offered).toContain('cellars.types.HUMIDOR');
  });

  it('the wizard and the cellars page read the same constant, not their own list', () => {
    const root = path.join(import.meta.dirname, '..', '..', '..');
    for (const file of ['components/onboarding/steps/CellarStep.tsx', 'components/cellars/CellarDashboard.tsx']) {
      const source = readFileSync(path.join(root, file), 'utf8');
      expect(source, file).toContain('CELLAR_TYPES');
      expect(source, file).not.toMatch(/key="(VINTAGE|COOLER|SHELF|HUMIDOR)"|key: '(VINTAGE|COOLER|SHELF|HUMIDOR)'/);
    }
  });
});
