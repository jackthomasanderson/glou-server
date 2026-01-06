"use client";

import React, { useState } from "react";
import { useCellars, useDeleteCellar } from "@/lib/cellars/store";
import { CellarType } from "@/types/cellars";
import { useRouter } from "next/navigation";
import { useTranslations } from "@/lib/i18n/I18nProvider";

export function CellarList() {
  const router = useRouter();
  const { data: cellars, isLoading, error } = useCellars();
  const deleteMutation = useDeleteCellar();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const { t } = useTranslations();

  const handleDelete = async (cellarId: string) => {
    const ok = confirm(`${t("cellars.deleteConfirm")}\n\n${t("cellars.deleteWarning")}`);
    if (ok) {
      setDeletingId(cellarId);
      try {
        await deleteMutation.mutateAsync(cellarId);
      } finally {
        setDeletingId(null);
      }
    }
  };

  if (isLoading) {
    return (
      <section className="panel">
        <p className="feedback">{t("cellars.loading")}</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="panel">
        <p className="feedback">{t("cellars.loadingError")}</p>
      </section>
    );
  }

  return (
    <section className="panel">
      <div className="panel__header">
        <div>
          <p className="eyebrow">{t("app.name")}</p>
          <h1>{t("cellars.title")}</h1>
        </div>
        <div className="actions-inline">
          <button className="primary" type="button" onClick={() => router.push("/cellars/new")}
          >
            {t("cellars.newCellar")}
          </button>
        </div>
      </div>

      {!cellars || cellars.length === 0 ? (
        <div className="form__actions">
          <p className="feedback">{t("cellars.noCellarsDescription")}</p>
          <button className="primary" type="button" onClick={() => router.push("/cellars/new")}
          >
            {t("cellars.createCellar")}
          </button>
        </div>
      ) : (
        <div className="cards">
          {cellars.map((cellar) => (
            <article key={cellar.id} className="card">
              <div className="card__header">
                <div>
                  <h3>{cellar.name}</h3>
                  {cellar.description ? <p>{cellar.description}</p> : null}
                </div>
                <div className="pills">
                  <span className="pill">{t(`cellars.types.${cellar.cellarType as CellarType}`)}</span>
                </div>
              </div>

              <p className="feedback" style={{ marginTop: 8 }}>
                {typeof cellar.bottleCount === "number" && cellar.bottleCount > 0
                  ? `${cellar.bottleCount} ${t("cellars.stats.bottleCount")}`
                  : t("cellars.stats.empty")}
              </p>

              {cellar.locationDescription ? <p className="feedback">{cellar.locationDescription}</p> : null}

              <div className="actions-inline" style={{ marginTop: 12 }}>
                <button
                  className="primary"
                  type="button"
                  onClick={() => router.push(`/cellars/${cellar.id}`)}
                >
                  {t("cellars.viewCellar")}
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(cellar.id)}
                  disabled={deletingId === cellar.id}
                >
                  {deletingId === cellar.id ? t("cellars.deleting") : t("cellars.deleteCellar")}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
