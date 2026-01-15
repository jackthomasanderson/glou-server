"use client";

import { useEffect, useState } from "react";
import { CigarManager } from "./CigarManager";
import { PageTitle } from "../PageTitle";
import { AppHeaderClient } from "../AppHeaderClient";

export function CigarsPageContent() {
    const [isHydrated, setIsHydrated] = useState(false);

    useEffect(() => {
        setIsHydrated(true);
    }, []);

    if (!isHydrated) return null;

    return (
        <div className="dashboard">
            <PageTitle pageKey="cigars" />
            <AppHeaderClient />
            <CigarManager />
        </div>
    );
}
