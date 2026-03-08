import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Glou — Gestionnaire de Cave',
  description: 'Application self-hosted de gestion de cave : vins, spiritueux, bulles, cigares.',
};

export default function HomePage() {
  return (
    <main style={{ 
      minHeight: '100vh', 
      display: 'flex', 
      flexDirection: 'column',
      alignItems: 'center', 
      justifyContent: 'center',
      fontFamily: 'Inter, system-ui, sans-serif',
      background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)',
      color: '#F1F5F9',
      padding: '2rem',
    }}>
      <div style={{ textAlign: 'center', maxWidth: 520 }}>
        <h1 style={{ fontSize: '3rem', fontWeight: 700, color: '#3B82F6', marginBottom: '0.5rem' }}>
          🍷 Glou
        </h1>
        <p style={{ fontSize: '1.1rem', color: '#94A3B8', marginBottom: '2.5rem' }}>
          Votre cave, à portée de main. Self-hosted, souverain, privé.
        </p>
        <Link href="/bottles" style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.75rem 2rem',
          background: '#2563EB',
          color: '#fff',
          borderRadius: '8px',
          textDecoration: 'none',
          fontWeight: 600,
          fontSize: '1rem',
          transition: 'background 0.2s',
        }}>
          Accéder à ma cave →
        </Link>
      </div>
    </main>
  );
}
