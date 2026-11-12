import type { Metadata } from 'next';
import { AnalyticsDashboard } from '@/components/analytics/AnalyticsDashboard';

export const metadata: Metadata = {
  description: 'Rapport financier, volumétrique et géographique de la cave.',
};

export default function AnalyticsPage() {
  return <AnalyticsDashboard />;
}
