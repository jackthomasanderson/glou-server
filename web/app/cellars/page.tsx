'use client';

import React from 'react';
import { MainLayout } from '../../components/ui/MainLayout';
import { CellarDashboard } from '../../components/cellars/CellarDashboard';

export default function CellarPage() {
  return (
    <MainLayout>
      <div className="max-w-6xl mx-auto px-4 py-8">
        <CellarDashboard />
      </div>
    </MainLayout>
  );
}
