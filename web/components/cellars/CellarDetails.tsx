"use client";

import React from "react";
import { useCellarById, useUpdateCellar } from "@/lib/cellars/store";
import { CellarType } from "@/types/cellars";
import { useTranslations } from "@/lib/i18n/I18nProvider";

interface CellarDetailsProps {
  cellarId: string;
}

const cellarTypes: CellarType[] = ["cellar", "showcase", "climate_cabinet", "rack", "other"];

export function CellarDetails({ cellarId }: CellarDetailsProps) {
  const { data: cellar, isLoading, error } = useCellarById(cellarId);
  const updateMutation = useUpdateCellar();
  const { t, locale } = useTranslations();
  const [isEditing, setIsEditing] = React.useState(false);
  const [formData, setFormData] = React.useState({
    name: "",
    description: "",
    cellarType: "cellar" as CellarType,
    locationDescription: "",
  });

  React.useEffect(() => {
    if (cellar) {
      setFormData({
        name: cellar.name,
        description: cellar.description || "",
        cellarType: cellar.cellarType,
        locationDescription: cellar.locationDescription || "",
      });
    }
  }, [cellar]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      await updateMutation.mutateAsync({
        cellarId,
        input: {
          ...formData,
          description: formData.description || null,
          locationDescription: formData.locationDescription || null,
        },
      });
      setIsEditing(false);
    } catch (err) {
      console.error("Failed to update cellar:", err);
    }
  };

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
      <section className="panel">
        <div className="panel__header">
          <div>
            <p className="eyebrow">{t("app.name")}</p>
            <h2>{t("cellars.editCellar")}</h2>
          </div>
        </div>

        {updateMutation.error ? <p className="feedback">{t("cellars.updateError")}</p> : null}

        <form onSubmit={handleSubmit} className="form">
          <div className="field">
            <label htmlFor="cellar-name">{t("cellars.form.name")}</label>
            <input
              id="cellar-name"
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              required
              maxLength={255}
            />
          </div>

          <div className="field">
            <label htmlFor="cellar-type">{t("cellars.form.type")}</label>
            <select id="cellar-type" name="cellarType" value={formData.cellarType} onChange={handleChange}>
              {cellarTypes.map((type) => (
                <option key={type} value={type}>
                  {t(`cellars.types.${type}`)}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="cellar-description">{t("cellars.form.description")}</label>
            <textarea
              id="cellar-description"
              name="description"
              value={formData.description}
              onChange={handleChange}
              rows={3}
            />
          </div>

          <div className="field">
            <label htmlFor="cellar-location">{t("cellars.form.location")}</label>
            <input
              id="cellar-location"
              type="text"
              name="locationDescription"
              value={formData.locationDescription}
              onChange={handleChange}
            />
          </div>

          <div className="form__actions">
            <button type="submit" disabled={updateMutation.isPending} className="primary">
              {updateMutation.isPending ? t("cellars.updating") : t("cellars.form.update")}
            </button>
            <button type="button" onClick={() => setIsEditing(false)}>
              {t("cellars.form.cancel")}
            </button>
          </div>
        </form>
      </section>
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
