import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { frenchT } from '@/lib/products/__tests__/i18n';
import { resetReviewBanner } from '@/lib/review/banner';
import type { ReviewCases } from '@/lib/review/client';

// #471 (ux-ui.md §10.7, decision QP5): "N points à vérifier après la mise à
// jour" above the list, "Voir", and "Plus tard" until the next sign-in.

let t: Awaited<ReturnType<typeof frenchT>>;
beforeAll(async () => { t = await frenchT(); });

let cases: ReviewCases | undefined;
vi.mock('@/hooks/useReview', () => ({ useReviewCases: () => ({ data: cases }) }));

import { ReviewBanner } from '../ReviewBanner';

const some = (merges: number, counts: number) => ({
  merges: Array.from({ length: merges }, () => ({}) as ReviewCases['merges'][number]),
  counts: Array.from({ length: counts }, () => ({}) as ReviewCases['counts'][number]),
});
const renderBanner = () => render(<ReviewBanner t={(key, options) => t(key, options)} />);

beforeEach(() => {
  window.localStorage.clear();
  cases = some(4, 2);
});

describe('ReviewBanner', () => {
  it('counts every point left and links to the review screen', () => {
    renderBanner();
    expect(screen.getByTestId('review-banner')).toHaveTextContent('6 points à vérifier après la mise à jour');
    expect(screen.getByText('Voir').closest('a')).toHaveAttribute('href', '/review');
  });

  it('is absent while loading and once everything is settled', () => {
    cases = undefined;
    const { rerender } = renderBanner();
    expect(screen.queryByTestId('review-banner')).toBeNull();
    cases = some(0, 0);
    rerender(<ReviewBanner t={(key, options) => t(key, options)} />);
    expect(screen.queryByTestId('review-banner')).toBeNull();
  });

  it('"Plus tard" hides it, across reloads, until the next sign-in', () => {
    const first = renderBanner();
    fireEvent.click(screen.getByRole('button', { name: 'Plus tard' }));
    expect(screen.queryByTestId('review-banner')).toBeNull();
    first.unmount();

    // Reloaded: still postponed.
    const second = renderBanner();
    expect(screen.queryByTestId('review-banner')).toBeNull();
    second.unmount();

    // Signed in again (useAuth clears it): back while points are left.
    resetReviewBanner();
    renderBanner();
    expect(screen.getByTestId('review-banner')).toHaveTextContent('6 points à vérifier après la mise à jour');
  });

  it('says one point in the singular', () => {
    cases = some(0, 1);
    renderBanner();
    expect(screen.getByTestId('review-banner')).toHaveTextContent('1 point à vérifier après la mise à jour');
  });
});
