"use client";

import React from "react";
import { useCreateCave } from "@/lib/caves/store";
import { CaveType } from "@/types/caves";
import { useRouter } from "next/navigation";

interface CaveFormProps {
  locale: "en" | "fr";
  onSuccess?: () => void;
  defaultName?: string;
}

const caveTypes: CaveType[] = ["cellar", "showcase", "climate_cabinet", "rack", "other"];

const caveTypeLabels: Record<CaveType, { en: string; fr: string }> = {
  cellar: { en: "Wine Cellar", fr: "Cave à vin" },
  showcase: { en: "Showcase", fr: "Vitrine" },
  climate_cabinet: { en: "Climate Cabinet", fr: "Armoire climatisée" },
  rack: { en: "Rack", fr: "Casier" },
  other: { en: "Other", fr: "Autre" },
};

export function CaveForm({ locale, onSuccess, defaultName = "" }: CaveFormProps) {
  const router = useRouter();
  const createMutation = useCreateCave();
  const [formData, setFormData] = React.useState({
    name: defaultName,
    description: "",
    caveType: "cellar" as CaveType,
    locationDescription: "",
  });

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value || null,
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

      router.push("/dashboard/caves");
      if (onSuccess) onSuccess();
    } catch (err) {
      console.error("Failed to create cave:", err);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-gray-800 border border-gray-700 rounded-lg p-6 max-w-2xl">
      <div className="mb-4">
        <label className="block text-gray-300 text-sm font-medium mb-2">
          {locale === "fr" ? "Nom" : "Name"}
        </label>
        <input
          type="text"
          name="name"
          value={formData.name}
          onChange={handleChange}
          required
          maxLength={255}
          className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded text-white focus:outline-none focus:border-yellow-600"
          placeholder={locale === "fr" ? "Nom de la cave" : "Cave name"}
        />
      </div>

      <div className="mb-4">
        <label className="block text-gray-300 text-sm font-medium mb-2">
          {locale === "fr" ? "Type" : "Type"}
        </label>
        <select
          name="caveType"
          value={formData.caveType}
          onChange={handleChange}
          className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded text-white focus:outline-none focus:border-yellow-600"
        >
          {caveTypes.map((type) => (
            <option key={type} value={type}>
              {caveTypeLabels[type]?.[locale]}
            </option>
          ))}
        </select>
      </div>

      <div className="mb-4">
        <label className="block text-gray-300 text-sm font-medium mb-2">
          {locale === "fr" ? "Description" : "Description"}
        </label>
        <textarea
          name="description"
          value={formData.description}
          onChange={handleChange}
          rows={3}
          className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded text-white focus:outline-none focus:border-yellow-600"
          placeholder={locale === "fr" ? "Description optionnelle" : "Optional description"}
        />
      </div>

      <div className="mb-6">
        <label className="block text-gray-300 text-sm font-medium mb-2">
          {locale === "fr" ? "Localisation" : "Location"}
        </label>
        <input
          type="text"
          name="locationDescription"
          value={formData.locationDescription}
          onChange={handleChange}
          className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded text-white focus:outline-none focus:border-yellow-600"
          placeholder={locale === "fr" ? "Ex: Sous-sol" : "Ex: Basement"}
        />
      </div>

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={createMutation.isPending}
          className="flex-1 px-4 py-2 bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-700 text-white font-medium rounded transition-colors"
        >
          {createMutation.isPending
            ? locale === "fr"
              ? "Création..."
              : "Creating..."
            : locale === "fr"
              ? "Créer"
              : "Create"}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white font-medium rounded transition-colors"
        >
          {locale === "fr" ? "Annuler" : "Cancel"}
        </button>
      </div>

      {createMutation.error && (
        <div className="mt-4 bg-red-900/20 border border-red-700 text-red-200 px-4 py-3 rounded">
          {locale === "fr"
            ? "Erreur lors de la création"
            : "Error creating cave"}
        </div>
      )}
    </form>
  );
}
