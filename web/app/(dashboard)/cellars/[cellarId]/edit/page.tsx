"use client";

import React from "react";
import { useCellarById } from "@/lib/cellars/store";
import { CellarForm } from "@/components/cellars/CellarForm";
import { useTranslations } from "@/lib/i18n/I18nProvider";
import { useParams } from "next/navigation";

export default function EditCellarPage() {
    const params = useParams();
    const cellarId = params.cellarId as string;
    const { data: cellar, isLoading, error } = useCellarById(cellarId);
    const { t } = useTranslations();

    if (isLoading) {
        return (
            <section className="panel">
                <p className="feedback">{t("cellars.loading")}</p>
            </section>
        );
    }

    if (error || !cellar) {
        return (
            <section className="panel">
                <p className="feedback">{t("cellars.cellarNotFound")}</p>
            </section>
        );
    }

    return <CellarForm existingCellar={cellar} />;
}
