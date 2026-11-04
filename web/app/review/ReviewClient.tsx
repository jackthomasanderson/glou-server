'use client';
import { MainLayout } from '@/components/ui/MainLayout';
import { ReviewScreen } from '@/components/review/ReviewScreen';

export function ReviewClient() {
  return (
    <MainLayout>
      <ReviewScreen />
    </MainLayout>
  );
}
