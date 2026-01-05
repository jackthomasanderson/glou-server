"use client";

import React, { useState } from "react";
import { useCaves, useDeleteCave } from "@/lib/caves/store";
import { CaveType } from "@/types/caves";
import Link from "next/link";

const caveTypeLabels: Record<CaveType, { en: string; fr: string }> = {
  cellar: { en: "Wine Cellar", fr: "Cave à vin" },
  showcase: { en: "Showcase", fr: "Vitrine" },
  climate_cabinet: { en: "Climate Cabinet", fr: "Armoire climatisée" },
  rack: { en: "Rack", fr: "Casier" },
  other: { en: "Other", fr: "Autre" },
};

interface CaveListProps {
  locale: "en" | "fr";
}

export function CaveList({ locale }: CaveListProps) {
  const { data: caves, isLoading, error } = useCaves();
  const deleteMutation = useDeleteCave();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (caveId: string) => {
    if (confirm(locale === "fr" ? "Êtes-vous sûr ?" : "Are you sure?")) {
      setDeletingId(caveId);
      try {
        await deleteMutation.mutateAsync(caveId);
      } finally {
        setDeletingId(null);
      }
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

  if (error) {
    return (
      <div className="bg-red-900/20 border border-red-700 text-red-200 px-4 py-3 rounded">
        {locale === "fr"
          ? "Erreur lors du chargement des caves"
          : "Error loading caves"}
      </div>
    );
  }

  if (!caves || caves.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-400 mb-4">
          {locale === "fr" ? "Aucune cave" : "No caves yet"}
        </p>
        <Link
          href="/dashboard/caves/new"
          className="inline-block px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded"
        >
          {locale === "fr" ? "Créer une cave" : "Create a cave"}
        </Link>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {caves.map((cave) => (
        <div
          key={cave.id}
          className="bg-gray-800 border border-gray-700 rounded-lg p-4 hover:border-yellow-600 transition-colors"
        >
          <div className="flex justify-between items-start mb-2">
            <h3 className="text-lg font-semibold text-white">{cave.name}</h3>
            <span className="text-xs px-2 py-1 bg-gray-700 rounded text-gray-300">
              {caveTypeLabels[cave.caveType as CaveType]?.[locale]}
            </span>
          </div>

          {cave.description && (
            <p className="text-gray-400 text-sm mb-3">{cave.description}</p>
          )}

          {cave.locationDescription && (
            <p className="text-gray-500 text-xs mb-4">
              📍 {cave.locationDescription}
            </p>
          )}

          <div className="flex gap-2 justify-between">
            <Link
              href={`/dashboard/caves/${cave.id}`}
              className="flex-1 px-3 py-2 bg-yellow-600 hover:bg-yellow-700 text-white text-sm rounded transition-colors text-center"
            >
              {locale === "fr" ? "Voir" : "View"}
            </Link>
            <button
              onClick={() => handleDelete(cave.id)}
              disabled={deletingId === cave.id}
              className="px-3 py-2 bg-red-900 hover:bg-red-800 disabled:bg-gray-700 text-white text-sm rounded transition-colors"
            >
              {deletingId === cave.id
                ? "..."
                : locale === "fr"
                  ? "Supprimer"
                  : "Delete"}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
