"use client";

import { useEffect, useState } from "react";
import { BottleDashboard } from "./BottleDashboard";
import { PageTitle } from "./PageTitle";
import { ConsumptionSuggestions } from "./ConsumptionSuggestions";
import { FoodToBottlePairing } from "./FoodToBottlePairing";

import { AppHeaderClient } from "./AppHeaderClient";

export function BottleDashboardWrapper() {
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  if (!isHydrated) {
    return null;
  }

  return (
    <div className="dashboard">
      <PageTitle pageKey="dashboard" />
      <AppHeaderClient />
      <FoodToBottlePairing />
      <BottleDashboard />
      <ConsumptionSuggestions />
    </div>
  );
}
