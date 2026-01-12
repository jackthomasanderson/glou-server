import { Metadata } from 'next'
import { BottleDashboardWrapper } from '@/components/BottleDashboardWrapper'

export const metadata: Metadata = {
  title: 'Bottles | Glou',
}

export default function BottlesPage() {
  return <BottleDashboardWrapper />
}
