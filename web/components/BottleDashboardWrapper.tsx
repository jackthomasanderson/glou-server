"use client";

import { useEffect, useState } from "react";
import { BottleDashboard } from "./BottleDashboard";
import { PageTitle } from "./PageTitle";

export function BottleDashboardWrapper() {
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  if (!isHydrated) {
    return null; // Avoid hydration mismatch by rendering nothing on server
  }

  return (
    <>
      <PageTitle pageKey="dashboard" />
      <BottleDashboard />
    </>
  );
}
