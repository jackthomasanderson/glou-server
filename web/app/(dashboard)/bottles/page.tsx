import { Metadata } from 'next'
import { BottlesPageContent } from '@/components/BottlesPageContent'

export const metadata: Metadata = {
  title: 'Bottles | Glou',
}

export default function BottlesPage() {
  return <BottlesPageContent />
}
