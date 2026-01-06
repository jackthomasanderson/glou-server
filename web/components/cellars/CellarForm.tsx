"use client";

import React from "react";
import { useCreateCellar } from "@/lib/cellars/store";
import { CellarType } from "@/types/cellars";
import { useRouter } from "next/navigation";
import { useTranslations } from "@/lib/i18n/I18nProvider";

interface CellarFormProps {
  onSuccess?: () => void;
  defaultName?: string;
}

const cellarTypes: CellarType[] = ["cellar", "showcase", "climate_cabinet", "rack", "other"];

export function CellarForm({ onSuccess, defaultName = "" }: CellarFormProps) {
  const router = useRouter();
  const createMutation = useCreateCellar();
  const { t } = useTranslations();
  const [formData, setFormData] = React.useState({
    name: defaultName,
    description: "",
    cellarType: "cellar" as CellarType,
    locationDescription: "",
  });

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
      await createMutation.mutateAsync({
        ...formData,
        description: formData.description || null,
        locationDescription: formData.locationDescription || null,
      });

      router.push("/cellars");
      if (onSuccess) onSuccess();
    } catch (err) {
      console.error("Failed to create cellar:", err);
    }
  };

  return (
    <section className="panel">
      <div className="panel__header">
        <div>
          <p className="eyebrow">{t("app.name")}</p>
          <h1>{t("cellars.createCellar")}</h1>
        </div>
      </div>

      {createMutation.error ? <p className="feedback">{t("cellars.createError")}</p> : null}

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
            placeholder={t("cellars.form.namePlaceholder")}
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
            placeholder={t("cellars.form.descriptionPlaceholder")}
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
            placeholder={t("cellars.form.locationPlaceholder")}
          />
        </div>

        <div className="form__actions">
          <button type="submit" disabled={createMutation.isPending} className="primary">
            {createMutation.isPending ? t("cellars.creating") : t("cellars.form.save")}
          </button>
          <button type="button" onClick={() => router.back()}>
            {t("cellars.form.cancel")}
          </button>
        </div>
      </form>
    </section>
  );
}
