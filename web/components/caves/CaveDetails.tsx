"use client";

import React from "react";
import { useCaveById, useUpdateCave } from "@/lib/caves/store";
import { CaveType } from "@/types/caves";

interface CaveDetailsProps {
  caveId: string;
  locale: "en" | "fr";
}

const caveTypes: CaveType[] = ["cellar", "showcase", "climate_cabinet", "rack", "other"];

const caveTypeLabels: Record<CaveType, { en: string; fr: string }> = {
  cellar: { en: "Wine Cellar", fr: "Cave à vin" },
  showcase: { en: "Showcase", fr: "Vitrine" },
  climate_cabinet: { en: "Climate Cabinet", fr: "Armoire climatisée" },
  rack: { en: "Rack", fr: "Casier" },
  other: { en: "Other", fr: "Autre" },
};

export function CaveDetails({ caveId, locale }: CaveDetailsProps) {
  const { data: cave, isLoading, error } = useCaveById(caveId);
  const updateMutation = useUpdateCave();
  const [isEditing, setIsEditing] = React.useState(false);
  const [formData, setFormData] = React.useState({
    name: "",
    description: "",
    caveType: "cellar" as CaveType,
    locationDescription: "",
  });

  React.useEffect(() => {
    if (cave) {
      setFormData({
        name: cave.name,
        description: cave.description || "",
        caveType: cave.caveType,
        locationDescription: cave.locationDescription || "",
      });
    }
  }, [cave]);

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
      await updateMutation.mutateAsync({
        caveId,
        input: {
          ...formData,
          description: formData.description || null,
          locationDescription: formData.locationDescription || null,
        },
      });
      setIsEditing(false);
    } catch (err) {
      console.error("Failed to update cave:", err);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="text-gray-400">
          {locale === "fr" ? "Chargement..." : "Loading..."}
        </div>
      </div>
    );
  }

  if (error || !cave) {
    return (
      <div className="bg-red-900/20 border border-red-700 text-red-200 px-4 py-3 rounded">
        {locale === "fr"
          ? "Erreur: Cave non trouvée"
          : "Error: Cave not found"}
      </div>
    );
  }

  if (isEditing) {
    return (
      <form onSubmit={handleSubmit} className="bg-gray-800 border border-gray-700 rounded-lg p-6 max-w-2xl">
        <h2 className="text-2xl font-bold text-white mb-6">
          {locale === "fr" ? "Modifier la cave" : "Edit Cave"}
        </h2>

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
          />
        </div>

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={updateMutation.isPending}
            className="flex-1 px-4 py-2 bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-700 text-white font-medium rounded transition-colors"
          >
            {updateMutation.isPending
              ? locale === "fr"
                ? "Mise à jour..."
                : "Updating..."
              : locale === "fr"
                ? "Mettre à jour"
                : "Update"}
          </button>
          <button
            type="button"
            onClick={() => setIsEditing(false)}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white font-medium rounded transition-colors"
          >
            {locale === "fr" ? "Annuler" : "Cancel"}
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 max-w-2xl">
      <div className="flex justify-between items-start mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white">{cave.name}</h2>
          <p className="text-gray-400 mt-1">
            {caveTypeLabels[cave.caveType as CaveType]?.[locale]}
          </p>
        </div>
        <button
          onClick={() => setIsEditing(true)}
          className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white font-medium rounded transition-colors"
        >
          {locale === "fr" ? "Modifier" : "Edit"}
        </button>
      </div>

      {cave.description && (
        <div className="mb-4">
          <p className="text-gray-300">{cave.description}</p>
        </div>
      )}

      {cave.locationDescription && (
        <div className="mb-4">
          <p className="text-gray-400">
            📍 {cave.locationDescription}
          </p>
        </div>
      )}

      <div className="border-t border-gray-700 pt-4 mt-6">
        <p className="text-gray-500 text-sm">
          {locale === "fr" ? "Créée le" : "Created at"}:{" "}
          {new Date(cave.createdAt).toLocaleDateString(locale)}
        </p>
      </div>
    </div>
  );
}
