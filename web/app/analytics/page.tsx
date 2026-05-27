import type { Metadata } from 'next';
import { AnalyticsDashboard } from '@/components/analytics/AnalyticsDashboard';

export const metadata: Metadata = {
  title: 'Analyses & Terroirs — Glou',
  description: 'Rapport global financier, volumétrique et géographique de la cave.',
};

export default function AnalyticsPage() {
  return <AnalyticsDashboard />;
}
