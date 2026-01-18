"use client";

import React from "react";
import { useCellarById } from "@/lib/cellars/store";
import { CellarType } from "@/types/cellars";
import { useTranslations } from "@/lib/i18n/I18nProvider";
import { CellarForm } from "./CellarForm";
import { useBottlesByCellar, useDeleteBottle, useUpdateBottle } from "@/lib/bottles/hooks";
import { BottleList } from "../BottleList";
import { BottleForm } from "../BottleForm";
import { BottleInput } from "@/lib/bottles/schema";
import { EditIcon } from "../Icon";
import { ViewSwitch, ViewMode } from "../ViewSwitch";

const STORAGE_KEY = "glou_bottles_view_mode";


interface CellarDetailsProps {
  cellarId: string;
}

export function CellarDetails({ cellarId }: CellarDetailsProps) {
  const { data: cellar, isLoading, error } = useCellarById(cellarId);
  const { t, locale } = useTranslations();
  const [isEditing, setIsEditing] = React.useState(false);

  // Bottles management
  const { data: bottles, isLoading: isLoadingBottles } = useBottlesByCellar(cellarId);
  const deleteBottleMutation = useDeleteBottle();
  const updateBottleMutation = useUpdateBottle();
  const [editingBottleId, setEditingBottleId] = React.useState<string | null>(null);
  const [viewingBottleId, setViewingBottleId] = React.useState<string | null>(null);
  const [viewMode, setViewMode] = React.useState<ViewMode>("grid");

  React.useEffect(() => {
    const savedMode = localStorage.getItem(STORAGE_KEY) as ViewMode;
    if (savedMode) {
      setViewMode(savedMode);
    }
  }, []);

  const editingBottle = React.useMemo(() =>
    editingBottleId ? bottles?.find(b => b.id === editingBottleId) ?? null : null
    , [bottles, editingBottleId]);

  const viewingBottle = React.useMemo(() =>
    viewingBottleId ? bottles?.find(b => b.id === viewingBottleId) ?? null : null
    , [bottles, viewingBottleId]);

  const handleBottleSave = (data: BottleInput) => {
    if (editingBottleId) {
      updateBottleMutation.mutate({ id: editingBottleId, input: data });
      setEditingBottleId(null);
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
          <button type="button" className="primary btn-icon" onClick={() => setIsEditing(true)} title={t("actions.edit")}>
            <EditIcon />
          </button>
        </div>
      </div>

      {cellar.description ? <p>{cellar.description}</p> : null}
      {cellar.locationDescription ? <p className="feedback">{cellar.locationDescription}</p> : null}

      <p className="feedback" style={{ marginTop: 12 }}>
        {t("cellars.meta.createdAt")}: {new Date(cellar.createdAt).toLocaleDateString(locale)}
      </p>

      <div style={{ marginTop: 32 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3>{t("list.title")}</h3>
          {!editingBottleId && !viewingBottleId && (
            <ViewSwitch value={viewMode} onChange={setViewMode} storageKey={STORAGE_KEY} />
          )}
        </div>
        {editingBottleId || viewingBottleId ? (
          <BottleForm
            cellars={[cellar]}
            initialData={editingBottle || viewingBottle}
            onSave={handleBottleSave}
            onCancel={() => {
              setEditingBottleId(null);
              setViewingBottleId(null);
            }}
            readOnly={!!viewingBottleId}
          />
        ) : (
          <BottleList
            bottles={bottles ?? []}
            isLoading={isLoadingBottles}
            onView={(bottle) => setViewingBottleId(bottle.id)}
            onEdit={(bottle) => setEditingBottleId(bottle.id)}
            onDelete={(id) => deleteBottleMutation.mutate(id)}
            cellarType={cellar.cellarType}
            viewMode={viewMode}
          />
        )}
      </div>
    </section>
  );
}
