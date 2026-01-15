import { Metadata } from 'next'
import { CigarsPageContent } from '@/components/cigars/CigarsPageContent'

export const metadata: Metadata = {
  title: 'Cigars | Glou',
}

export default function CigarsPage() {
  return <CigarsPageContent />
}
