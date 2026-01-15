"use client";

import { useEffect, useState } from "react";
import { DashboardStats } from "./DashboardStats";
import { PageTitle } from "./PageTitle";
import { ConsumptionSuggestions } from "./ConsumptionSuggestions";
import { FoodToBottlePairing } from "./FoodToBottlePairing";
import { AppHeaderClient } from "./AppHeaderClient";

export function DashboardPageContent() {
    const [isHydrated, setIsHydrated] = useState(false);

    useEffect(() => {
        setIsHydrated(true);
    }, []);

    if (!isHydrated) return null;

    return (
        <div className="dashboard">
            <PageTitle pageKey="dashboard" />
            <AppHeaderClient />
            <FoodToBottlePairing />
            <DashboardStats />
            <ConsumptionSuggestions />
        </div>
    );
}
