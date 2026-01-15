"use client";

import React, { useState } from "react";
import { useCellars, useDeleteCellar } from "@/lib/cellars/store";
import { CellarType } from "@/types/cellars";
import { useRouter } from "next/navigation";
import { useTranslations } from "@/lib/i18n/I18nProvider";
import { EyeIcon, EditIcon, TrashIcon, PlusIcon } from "../Icon";

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
          <button className="primary btn-icon" type="button" onClick={() => router.push("/cellars/new")} title={t("cellars.newCellar")}>
            <PlusIcon />
          </button>
        </div>
      </div>

      {!cellars || cellars.length === 0 ? (
        <div className="form__actions">
          <p className="feedback">{t("cellars.noCellarsDescription")}</p>
          <button className="primary" type="button" onClick={() => router.push("/cellars/new")} title={t("cellars.createCellar")}>
            <PlusIcon /> {t("cellars.createCellar")}
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
                {(() => {
                  const hasBottles = typeof cellar.bottleCount === "number" && cellar.bottleCount > 0;
                  const hasCigars = typeof cellar.cigarCount === "number" && cellar.cigarCount > 0;

                  if (!hasBottles && !hasCigars) {
                    return t("cellars.stats.empty");
                  }

                  const parts = [];

                  if (hasBottles) {
                    parts.push(
                      `${cellar.bottleCount} ${cellar.bottleCapacity ? `/ ${cellar.bottleCapacity}` : ""} ${t("cellars.stats.bottleCount")}`
                    );
                  }

                  if (hasCigars) {
                    parts.push(`${cellar.cigarCount} ${t("cellars.stats.cigarCount")}`);
                  }

                  return parts.join(" - ");
                })()}
              </p>

              {cellar.placement ? <p className="feedback">{cellar.placement}</p> : null}
              {cellar.locationDescription ? <p className="feedback">{cellar.locationDescription}</p> : null}

              <div className="card__actions">
                <button
                  className="primary btn-icon"
                  type="button"
                  onClick={() => router.push(`/cellars/${cellar.id}`)}
                  title={t("cellars.viewCellar")}
                >
                  <EyeIcon />
                </button>
                <button
                  className="btn-icon"
                  type="button"
                  onClick={() => router.push(`/cellars/${cellar.id}/edit`)}
                  title={t("actions.edit")}
                >
                  <EditIcon />
                </button>
                <button
                  type="button"
                  className="danger btn-icon"
                  onClick={() => handleDelete(cellar.id)}
                  disabled={deletingId === cellar.id}
                  title={t("cellars.deleteCellar")}
                >
                  {deletingId === cellar.id ? (
                    <span className="spinner" />
                  ) : (
                    <TrashIcon />
                  )}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
