import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

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
