import { Metadata } from 'next'
import { CigarsList } from '@/components/cigars/CigarsList'

export const metadata: Metadata = {
  title: 'Cigars | Glou',
}

export default function CigarsPage() {
  return <CigarsList />
}
