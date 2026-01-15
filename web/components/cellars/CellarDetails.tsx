"use client";

import React from "react";
import { useCellarById } from "@/lib/cellars/store";
import { CellarType } from "@/types/cellars";
import { useTranslations } from "@/lib/i18n/I18nProvider";
import { CellarForm } from "./CellarForm";

interface CellarDetailsProps {
  cellarId: string;
}

export function CellarDetails({ cellarId }: CellarDetailsProps) {
  const { data: cellar, isLoading, error } = useCellarById(cellarId);
  const { t, locale } = useTranslations();
  const [isEditing, setIsEditing] = React.useState(false);

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

  if (isEditing) {
    return (
      <CellarForm
        existingCellar={cellar}
        onSuccess={() => setIsEditing(false)}
      />
    );
  }


  return (
    <section className="panel">
      <div className="panel__header">
        <div>
          <p className="eyebrow">{t(`cellars.types.${cellar.cellarType as CellarType}`)}</p>
          <h2>{cellar.name}</h2>
        </div>
        <div className="actions-inline">
          <button type="button" className="primary" onClick={() => setIsEditing(true)}>
            {t("actions.edit")}
          </button>
        </div>
      </div>

      {cellar.description ? <p>{cellar.description}</p> : null}
      {cellar.locationDescription ? <p className="feedback">{cellar.locationDescription}</p> : null}

      <p className="feedback" style={{ marginTop: 12 }}>
        {t("cellars.meta.createdAt")}: {new Date(cellar.createdAt).toLocaleDateString(locale)}
      </p>
    </section>
  );
}
