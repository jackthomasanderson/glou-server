"use client";

import { useEffect, useState } from "react";
import { BottleManager } from "./BottleManager";
import { PageTitle } from "./PageTitle";
import { AppHeaderClient } from "./AppHeaderClient";

export function BottlesPageContent() {
    const [isHydrated, setIsHydrated] = useState(false);

    useEffect(() => {
        setIsHydrated(true);
    }, []);

    if (!isHydrated) return null;

    return (
        <div className="dashboard">
            <PageTitle pageKey="bottles" />
            <AppHeaderClient />
            <BottleManager />
        </div>
    );
}
