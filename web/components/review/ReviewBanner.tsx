'use client';
import React, { useState } from 'react';
import Link from 'next/link';
import { Button } from '@heroui/react';
import { ClipboardCheck } from 'lucide-react';
import { useReviewCases } from '@/hooks/useReview';
import { isReviewBannerPostponed, postponeReviewBanner } from '@/lib/review/banner';
import { reviewPointCount } from '@/lib/review/cases';

/**
 * ux-ui.md §10.7: "6 points à vérifier après la mise à jour" with "Voir",
 * above the list. Information, not an error: no red, nothing blocking.
 * "Plus tard" hides it until the next sign-in (decision #471, QP5); it
 * disappears by itself once everything is settled.
 */
export function ReviewBanner({ t }: { t: (key: string, options?: Record<string, unknown>) => string }) {
  const { data } = useReviewCases();
  // Rendered empty until the cases are loaded client-side, so reading storage here is hydration-safe.
  const [postponed, setPostponed] = useState(isReviewBannerPostponed);
  const count = reviewPointCount(data);
  if (count === 0 || postponed) return null;

  const later = () => {
    setPostponed(true);
    postponeReviewBanner();
  };

  return (
    <div
      role="status"
      data-testid="review-banner"
      className="flex flex-wrap items-center gap-2 rounded-lg border border-primary-200 bg-primary-50 px-3 py-2 mb-3 text-sm"
    >
      <ClipboardCheck size={16} className="text-primary shrink-0" />
      <span className="flex-1 min-w-0">{t('review.banner', { count })}</span>
      <Button as={Link} href="/review" size="sm" variant="flat" color="primary">
        {t('review.bannerView')}
      </Button>
      <Button size="sm" variant="light" onPress={later}>
        {t('review.bannerLater')}
      </Button>
    </div>
  );
}
