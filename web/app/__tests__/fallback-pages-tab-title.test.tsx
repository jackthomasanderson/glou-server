import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import NotFound from '../not-found';
import ErrorPage from '../error';

// Review of #868: the not-found and error pages kept the tab title of the
// page left (« Caves — Glou ») instead of going back to the neutral one.
describe('fallback pages tab title', () => {
  it('the not-found page goes back to the neutral tab title', () => {
    document.title = 'Caves — Glou';
    render(<NotFound />);
    expect(document.title).toBe('Glou');
  });

  it('the error page goes back to the neutral tab title', () => {
    document.title = 'Caves — Glou';
    render(<ErrorPage error={new Error('boom')} reset={() => {}} />);
    expect(document.title).toBe('Glou');
  });
});
