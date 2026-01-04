"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { createBottle, deleteBottle, fetchBottles, restoreBottle, updateBottle } from "../lib/bottles/client";
import {
  type BottleCategory,
  type BottleInput,
  type BottleRecord,
  type CigarBottleInput,
  type SparklingBottleInput,
  type SpiritBottleInput,
  type WineBottleInput
} from "../lib/bottles/schema";
import { useTranslations } from "../lib/i18n/I18nProvider";
import { AppHeaderClient } from "./AppHeaderClient";
import { LocaleSync } from "./LocaleSync";

const queryKey = ["bottles"] as const;

const baseFields = {
  label: "",
  location: "",
  collection: "",
  tags: [] as string[],
  photoUrl: "",
  isOpened: false,
  fillLevel: undefined,
  estimatedValue: undefined as number | undefined,
  peakMaturity: undefined as { from?: number; to?: number } | undefined,
  alertStatus: "none" as BottleInput["alertStatus"]
};

type WineInput = WineBottleInput;
type SparklingInput = SparklingBottleInput;
type SpiritInput = SpiritBottleInput;
type CigarInput = CigarBottleInput;

const buildDefaults = (category: BottleCategory): BottleInput => {
  switch (category) {
    case "sparkling":
      return {
        ...baseFields,
        category,
        house: "",
        name: "",
        vintageOrNone: "",
        style: "",
        dosage: "",
        disgorgement: "",
        pressure: "",
        baseWine: "",
        servingTemp: ""
      };
    case "spirit":
      return {
        ...baseFields,
        category,
        distillery: "",
        nameEdition: "",
        abv: 40,
        ageStatement: "",
        caskType: "",
        batch: "",
        additiveNote: "",
        angelShare: "",
        aromaProfile: ""
      };
    case "cigar":
      return {
        ...baseFields,
        category,
        brand: "",
        format: "",
        quantity: 1,
        wrapper: "",
        binder: "",
        filler: "",
        factoryCode: "",
        targetHumidity: "",
        humidifier: ""
      };
    case "wine":
    default:
      return {
        ...baseFields,
        category: "wine",
        producer: "",
        name: "",
        vintageOrNone: "",
        color: "",
        appellation: "",
        grapes: "",
        abv: 13,
        format: "",
        servingTemp: "",
        lotNumber: "",
        carafing: ""
      };
  }
};

type Context = {
  previous?: BottleRecord[];
  tempId?: string;
};

export function BottleDashboard() {
  const { t } = useTranslations();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<BottleInput>(() => buildDefaults("wine"));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showOptionals, setShowOptionals] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const showToast = (message: string) => {
    setFeedback(message);
    setTimeout(() => setFeedback(null), 3000);
  };

  const { data: bottles = [], isLoading } = useQuery({ queryKey, queryFn: () => fetchBottles(true) });

  const commonMutateConfig = {
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<BottleRecord[]>(queryKey);
      return { previous } satisfies Context;
    },
    onError: (_error: unknown, _variables: unknown, context?: Context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous);
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey })
  } as const;

  const createMutation = useMutation({
    mutationFn: createBottle,
    onMutate: async (payload: BottleInput) => {
      const context = await commonMutateConfig.onMutate();
      const tempId = `temp-${Date.now()}`;
      const optimistic: BottleRecord = {
        ...(payload as BottleRecord),
        id: tempId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null
      };
      queryClient.setQueryData<BottleRecord[]>(queryKey, (current = []) => [optimistic, ...current]);
      showToast(t("feedback.optimisticCreate"));
      return { ...context, tempId } satisfies Context;
    },
    onError: (error, _variables, context) => {
      commonMutateConfig.onError?.(error, _variables, context);
      showToast(t("feedback.saveError"));
    },
    onSuccess: (data, _variables, context) => {
      queryClient.setQueryData<BottleRecord[]>(queryKey, (current = []) => {
        const withoutTemp = current.filter((item) => item.id !== context?.tempId);
        return [data, ...withoutTemp];
      });
    },
    onSettled: commonMutateConfig.onSettled
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: BottleInput }) => updateBottle(id, payload),
    onMutate: async ({ id, payload }) => {
      const context = await commonMutateConfig.onMutate();
      queryClient.setQueryData<BottleRecord[]>(queryKey, (current = []) =>
        current.map((item) => (item.id === id ? { ...item, ...payload, updatedAt: new Date().toISOString() } : item))
      );
      showToast(t("feedback.optimisticUpdate"));
      return context;
    },
    onError: (error, _variables, context) => {
      commonMutateConfig.onError?.(error, _variables, context);
      showToast(t("feedback.saveError"));
    },
    onSettled: commonMutateConfig.onSettled
  });

  const deleteMutation = useMutation({
    mutationFn: deleteBottle,
    onMutate: async (id: string) => {
      const context = await commonMutateConfig.onMutate();
      const deletionTime = new Date().toISOString();
      queryClient.setQueryData<BottleRecord[]>(queryKey, (current = []) =>
        current.map((item) => (item.id === id ? { ...item, deletedAt: deletionTime, updatedAt: deletionTime } : item))
      );
      showToast(t("feedback.optimisticDelete"));
      return context;
    },
    onError: (error, _variables, context) => {
      commonMutateConfig.onError?.(error, _variables, context);
      showToast(t("feedback.deleteError"));
    },
    onSettled: commonMutateConfig.onSettled
  });

  const restoreMutation = useMutation({
    mutationFn: restoreBottle,
    onMutate: async (id: string) => {
      const context = await commonMutateConfig.onMutate();
      queryClient.setQueryData<BottleRecord[]>(queryKey, (current = []) =>
        current.map((item) => (item.id === id ? { ...item, deletedAt: null, updatedAt: new Date().toISOString() } : item))
      );
      showToast(t("feedback.optimisticRestore"));
      return context;
    },
    onError: (error, _variables, context) => {
      commonMutateConfig.onError?.(error, _variables, context);
      showToast(t("feedback.restoreError"));
    },
    onSettled: commonMutateConfig.onSettled
  });

  const handleCategoryChange = (category: BottleCategory) => {
    const preserved = {
      ...baseFields,
      label: form.label,
      location: form.location,
      collection: form.collection,
      tags: form.tags ?? [],
      photoUrl: form.photoUrl,
      isOpened: form.isOpened,
      fillLevel: form.fillLevel,
      estimatedValue: form.estimatedValue,
      peakMaturity: form.peakMaturity,
      alertStatus: form.alertStatus
    };
    setForm({ ...buildDefaults(category), ...preserved, category });
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (editingId) {
      updateMutation.mutate({ id: editingId, payload: form });
    } else {
      createMutation.mutate(form);
    }
    setEditingId(null);
  };

  const startEdit = (record: BottleRecord) => {
    const { id, createdAt, updatedAt, deletedAt, ...rest } = record;
    setForm(rest as BottleInput);
    setEditingId(id);
    setShowOptionals(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const resetForm = () => {
    setForm(buildDefaults(form.category));
    setEditingId(null);
    setShowOptionals(false);
  };

  const essentials = useMemo(() => {
    switch (form.category) {
      case "sparkling": {
        const sparklingForm = form as SparklingInput;
        return (
          <div className="grid">
            <Field label={t("fields.house")} required>
              <input value={sparklingForm.house} onChange={(e) => setForm((prev) => ({ ...prev, house: e.target.value }))} />
            </Field>
            <Field label={t("fields.name")} required>
              <input value={sparklingForm.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} />
            </Field>
          </div>
        );
      }
      case "spirit": {
        const spiritForm = form as SpiritInput;
        return (
          <div className="grid">
            <Field label={t("fields.distillery")} required>
              <input value={spiritForm.distillery} onChange={(e) => setForm((prev) => ({ ...prev, distillery: e.target.value }))} />
            </Field>
            <Field label={t("fields.nameEdition")} required>
              <input value={spiritForm.nameEdition} onChange={(e) => setForm((prev) => ({ ...prev, nameEdition: e.target.value }))} />
            </Field>
            <Field label={t("fields.abv")} required>
              <input
                type="number"
                min={20}
                max={80}
                step={0.5}
                value={spiritForm.abv ?? ""}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, abv: e.target.value ? Number(e.target.value) : undefined }))
                }
              />
            </Field>
          </div>
        );
      }
      case "cigar": {
        const cigarForm = form as CigarInput;
        return (
          <div className="grid">
            <Field label={t("fields.brand")} required>
              <input value={cigarForm.brand} onChange={(e) => setForm((prev) => ({ ...prev, brand: e.target.value }))} />
            </Field>
            <Field label={t("fields.format")} required>
              <input value={cigarForm.format} onChange={(e) => setForm((prev) => ({ ...prev, format: e.target.value }))} />
            </Field>
            <Field label={t("fields.quantity")} required>
              <input
                type="number"
                min={1}
                value={cigarForm.quantity}
                onChange={(e) => setForm((prev) => ({ ...prev, quantity: Number(e.target.value) }))}
              />
            </Field>
          </div>
        );
      }
      case "wine":
      default: {
        const wineForm = form as WineInput;
        return (
          <div className="grid">
            <Field label={t("fields.producer")} required>
              <input value={wineForm.producer} onChange={(e) => setForm((prev) => ({ ...prev, producer: e.target.value }))} />
            </Field>
            <Field label={t("fields.name")} required>
              <input value={wineForm.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} />
            </Field>
            <Field label={t("fields.vintageOrNone")} required>
              <input value={wineForm.vintageOrNone} onChange={(e) => setForm((prev) => ({ ...prev, vintageOrNone: e.target.value }))} />
            </Field>
          </div>
        );
      }
    }
  }, [form, t]);

  const optionalFields = useMemo(() => {
    switch (form.category) {
      case "sparkling": {
        const sparklingForm = form as SparklingInput;
        return (
          <div className="grid">
            <Field label={t("fields.vintageOrNone")}>
              <input value={sparklingForm.vintageOrNone ?? ""} onChange={(e) => setForm((prev) => ({ ...prev, vintageOrNone: e.target.value }))} />
            </Field>
            <Field label={t("fields.dosage")}>
              <input value={sparklingForm.dosage ?? ""} onChange={(e) => setForm((prev) => ({ ...prev, dosage: e.target.value }))} />
            </Field>
            <Field label={t("fields.disgorgement")}>
              <input value={sparklingForm.disgorgement ?? ""} onChange={(e) => setForm((prev) => ({ ...prev, disgorgement: e.target.value }))} />
            </Field>
            <Field label={t("fields.pressure")}>
              <input value={sparklingForm.pressure ?? ""} onChange={(e) => setForm((prev) => ({ ...prev, pressure: e.target.value }))} />
            </Field>
            <Field label={t("fields.baseWine")}>
              <input value={sparklingForm.baseWine ?? ""} onChange={(e) => setForm((prev) => ({ ...prev, baseWine: e.target.value }))} />
            </Field>
            <Field label={t("fields.servingTemp")}>
              <input value={sparklingForm.servingTemp ?? ""} onChange={(e) => setForm((prev) => ({ ...prev, servingTemp: e.target.value }))} />
            </Field>
          </div>
        );
      }
      case "spirit": {
        const spiritForm = form as SpiritInput;
        return (
          <div className="grid">
            <Field label={t("fields.ageStatement")}>
              <input value={spiritForm.ageStatement ?? ""} onChange={(e) => setForm((prev) => ({ ...prev, ageStatement: e.target.value }))} />
            </Field>
            <Field label={t("fields.caskType")}>
              <input value={spiritForm.caskType ?? ""} onChange={(e) => setForm((prev) => ({ ...prev, caskType: e.target.value }))} />
            </Field>
            <Field label={t("fields.batch")}>
              <input value={spiritForm.batch ?? ""} onChange={(e) => setForm((prev) => ({ ...prev, batch: e.target.value }))} />
            </Field>
            <Field label={t("fields.additiveNote")}>
              <input value={spiritForm.additiveNote ?? ""} onChange={(e) => setForm((prev) => ({ ...prev, additiveNote: e.target.value }))} />
            </Field>
            <Field label={t("fields.angelShare")}>
              <input value={spiritForm.angelShare ?? ""} onChange={(e) => setForm((prev) => ({ ...prev, angelShare: e.target.value }))} />
            </Field>
            <Field label={t("fields.aromaProfile")}>
              <input value={spiritForm.aromaProfile ?? ""} onChange={(e) => setForm((prev) => ({ ...prev, aromaProfile: e.target.value }))} />
            </Field>
          </div>
        );
      }
      case "cigar": {
        const cigarForm = form as CigarInput;
        return (
          <div className="grid">
            <Field label={t("fields.wrapper")}>
              <input value={cigarForm.wrapper ?? ""} onChange={(e) => setForm((prev) => ({ ...prev, wrapper: e.target.value }))} />
            </Field>
            <Field label={t("fields.binder")}>
              <input value={cigarForm.binder ?? ""} onChange={(e) => setForm((prev) => ({ ...prev, binder: e.target.value }))} />
            </Field>
            <Field label={t("fields.filler")}>
              <input value={cigarForm.filler ?? ""} onChange={(e) => setForm((prev) => ({ ...prev, filler: e.target.value }))} />
            </Field>
            <Field label={t("fields.factoryCode")}>
              <input value={cigarForm.factoryCode ?? ""} onChange={(e) => setForm((prev) => ({ ...prev, factoryCode: e.target.value }))} />
            </Field>
            <Field label={t("fields.targetHumidity")}>
              <input value={cigarForm.targetHumidity ?? ""} onChange={(e) => setForm((prev) => ({ ...prev, targetHumidity: e.target.value }))} />
            </Field>
            <Field label={t("fields.humidifier")}>
              <input value={cigarForm.humidifier ?? ""} onChange={(e) => setForm((prev) => ({ ...prev, humidifier: e.target.value }))} />
            </Field>
          </div>
        );
      }
      case "wine":
      default: {
        const wineForm = form as WineInput;
        return (
          <div className="grid">
            <Field label={t("fields.color")}>
              <input value={wineForm.color ?? ""} onChange={(e) => setForm((prev) => ({ ...prev, color: e.target.value }))} />
            </Field>
            <Field label={t("fields.appellation")}>
              <input value={wineForm.appellation ?? ""} onChange={(e) => setForm((prev) => ({ ...prev, appellation: e.target.value }))} />
            </Field>
            <Field label={t("fields.grapes")}>
              <input value={wineForm.grapes ?? ""} onChange={(e) => setForm((prev) => ({ ...prev, grapes: e.target.value }))} />
            </Field>
            <Field label={t("fields.abv")}>
              <input
                type="number"
                min={0}
                max={20}
                step={0.1}
                value={wineForm.abv ?? ""}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, abv: e.target.value ? Number(e.target.value) : undefined }))
                }
              />
            </Field>
            <Field label={t("fields.format")}>
              <input value={wineForm.format ?? ""} onChange={(e) => setForm((prev) => ({ ...prev, format: e.target.value }))} />
            </Field>
            <Field label={t("fields.servingTemp")}>
              <input value={wineForm.servingTemp ?? ""} onChange={(e) => setForm((prev) => ({ ...prev, servingTemp: e.target.value }))} />
            </Field>
            <Field label={t("fields.lotNumber")}>
              <input value={wineForm.lotNumber ?? ""} onChange={(e) => setForm((prev) => ({ ...prev, lotNumber: e.target.value }))} />
            </Field>
            <Field label={t("fields.carafing")}>
              <input value={wineForm.carafing ?? ""} onChange={(e) => setForm((prev) => ({ ...prev, carafing: e.target.value }))} />
            </Field>
          </div>
        );
      }
    }
  }, [form, t]);

  const renderTagInput = () => (
    <input
      value={(form.tags ?? []).join(", ")}
      onChange={(e) =>
        setForm((prev) => ({
          ...prev,
          tags: e.target.value
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean)
        }))
      }
      placeholder={t("fields.tagsPlaceholder")}
    />
  );

  const renderFillLevelSelect = () => (
    <select
      value={form.fillLevel ?? ""}
      onChange={(e) => setForm((prev) => ({ ...prev, fillLevel: (e.target.value || undefined) as BottleInput["fillLevel"] }))}
    >
      <option value="">--</option>
      <option value="full">{t("levels.full")}</option>
      <option value="threeQuarters">{t("levels.threeQuarters")}</option>
      <option value="half">{t("levels.half")}</option>
      <option value="low">{t("levels.low")}</option>
      <option value="empty">{t("levels.empty")}</option>
    </select>
  );

  return (
    <div className="dashboard">
      <LocaleSync />
      <AppHeader />
      
      <section className="panel">
        <header className="panel__header">
          <h2>{t("sections.common")}</h2>
          <div className="actions-inline">
            <button type="button" className="ghost" onClick={resetForm}>
              {t("actions.reset")}
            </button>
            {editingId && (
              <button type="button" className="ghost" onClick={() => setEditingId(null)}>
                {t("actions.cancelEdit")}
              </button>
            )}
          </div>
        </header>

        <form className="form" onSubmit={handleSubmit}>
          <div className="section">
            <div className="section__title">{t("sections.common")}</div>
            <p className="section__hint">{t("sections.requiredHint")}</p>
            <div className="grid">
              <Field label={t("fields.label")} required>
                <input value={form.label} onChange={(e) => setForm((prev) => ({ ...prev, label: e.target.value }))} />
              </Field>
              <Field label={t("fields.category")} required>
                <select value={form.category} onChange={(e) => handleCategoryChange(e.target.value as BottleCategory)}>
                  <option value="wine">{t("categories.wine")}</option>
                  <option value="sparkling">{t("categories.sparkling")}</option>
                  <option value="spirit">{t("categories.spirit")}</option>
                  <option value="cigar">{t("categories.cigar")}</option>
                </select>
              </Field>
              <Field label={t("fields.location")}>
                <input value={form.location ?? ""} onChange={(e) => setForm((prev) => ({ ...prev, location: e.target.value }))} />
              </Field>
              <Field label={t("fields.collection")}>
                <input value={form.collection ?? ""} onChange={(e) => setForm((prev) => ({ ...prev, collection: e.target.value }))} />
              </Field>
              <Field label={t("fields.tags")}>
                {renderTagInput()}
              </Field>
              <Field label={t("fields.photoUrl")}>
                <input value={form.photoUrl ?? ""} onChange={(e) => setForm((prev) => ({ ...prev, photoUrl: e.target.value }))} />
              </Field>
              <Field label={t("fields.estimatedValue")}>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={form.estimatedValue ?? ""}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, estimatedValue: e.target.value ? Number(e.target.value) : undefined }))
                  }
                />
              </Field>
              <Field label={t("fields.fillLevel")}>{renderFillLevelSelect()}</Field>
              <Field label={t("fields.peakFrom")}>
                <input
                  type="number"
                  min={1900}
                  max={2100}
                  value={form.peakMaturity?.from ?? ""}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      peakMaturity: { ...prev.peakMaturity, from: e.target.value ? Number(e.target.value) : undefined }
                    }))
                  }
                />
              </Field>
              <Field label={t("fields.peakTo")}>
                <input
                  type="number"
                  min={1900}
                  max={2100}
                  value={form.peakMaturity?.to ?? ""}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      peakMaturity: { ...prev.peakMaturity, to: e.target.value ? Number(e.target.value) : undefined }
                    }))
                  }
                />
              </Field>
              <Field label={t("fields.alertStatus")}>
                <select
                  value={form.alertStatus ?? "none"}
                  onChange={(e) => setForm((prev) => ({ ...prev, alertStatus: e.target.value as BottleInput["alertStatus"] }))}
                >
                  <option value="none">{t("alerts.none")}</option>
                  <option value="approaching">{t("alerts.approaching")}</option>
                  <option value="critical">{t("alerts.critical")}</option>
                </select>
              </Field>
              <Field label={t("fields.isOpened")}>
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={form.isOpened ?? false}
                    onChange={(e) => setForm((prev) => ({ ...prev, isOpened: e.target.checked }))}
                  />
                  <span>{form.isOpened ? t("list.opened") : t("list.closed")}</span>
                </label>
              </Field>
            </div>
          </div>

          <div className="section">
            <div className="section__title">{t("sections.category")}</div>
            {essentials}
          </div>

          <div className="section optional">
            <div className="section__title with-toggle">
              <span>{t("sections.optional")}</span>
              <button type="button" className="ghost" onClick={() => setShowOptionals((prev) => !prev)}>
                {showOptionals ? t("optionals.hide") : t("optionals.show")}
              </button>
            </div>
            {showOptionals && optionalFields}
          </div>

          <div className="form__actions">
            <button type="submit" className="primary">
              {editingId ? t("actions.update") : t("actions.save")}
            </button>
            {editingId && (
              <button type="button" className="ghost" onClick={() => setEditingId(null)}>
                {t("actions.cancelEdit")}
              </button>
            )}
          </div>
        </form>
      </section>

      <section className="panel">
        <header className="panel__header">
          <div>
            <p className="eyebrow">{t("app.collection")}</p>
            <h2>{t("list.title")}</h2>
          </div>
          <span className="muted">{bottles.filter((b) => !b.deletedAt).length} / {bottles.length}</span>
        </header>
        {isLoading ? (
          <div className="empty">
            <div className="skeleton" style={{ width: "100%", height: "120px" }} />
            <div className="skeleton" style={{ width: "100%", height: "120px" }} />
          </div>
        ) : bottles.length === 0 ? (
          <div className="empty">
            <svg className="empty__icon" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M24 8h16v8h-16V8zM20 16h24v40c0 2.2-1.8 4-4 4H24c-2.2 0-4-1.8-4-4V16z" stroke="currentColor" strokeWidth="1.5" fill="none"/>
              <line x1="28" y1="24" x2="28" y2="48" stroke="currentColor" strokeWidth="1.5"/>
              <line x1="32" y1="24" x2="32" y2="48" stroke="currentColor" strokeWidth="1.5"/>
              <line x1="36" y1="24" x2="36" y2="48" stroke="currentColor" strokeWidth="1.5"/>
            </svg>
            <p>{t("list.empty")}</p>
          </div>
        ) : (
          <div className="cards">
            {bottles.map((bottle) => (
              <article key={bottle.id} className={`card ${bottle.deletedAt ? "card--muted" : ""}`}>
                <div className="card__header">
                  <div>
                    <p className="eyebrow">{t(`categories.${bottle.category}`)}</p>
                    <h3>{bottle.label}</h3>
                  </div>
                  <div className="pills">
                    {bottle.deletedAt ? <span className="pill warning">{t("list.deleted")}</span> : null}
                    {bottle.isOpened ? <span className="pill info">{t("list.opened")}</span> : null}
                    {bottle.fillLevel ? <span className="pill">{t(`levels.${bottle.fillLevel}`)}</span> : null}
                    {bottle.alertStatus && bottle.alertStatus !== "none" ? (
                      <span className="pill danger">{t(`alerts.${bottle.alertStatus}`)}</span>
                    ) : null}
                  </div>
                </div>

                <div className="card__meta">
                  {bottle.estimatedValue !== undefined && (
                    <span>{t("list.value")}: €{bottle.estimatedValue}</span>
                  )}
                  {bottle.peakMaturity && (bottle.peakMaturity.from || bottle.peakMaturity.to) && (
                    <span>
                      {t("list.peak")}: {bottle.peakMaturity.from ?? "?"} – {bottle.peakMaturity.to ?? "?"}
                    </span>
                  )}
                  {bottle.location && <span>{t("list.location")}: {bottle.location}</span>}
                  {bottle.collection && <span>{t("list.collection")}: {bottle.collection}</span>}
                  {bottle.tags && bottle.tags.length > 0 && <span>{t("list.tags")}: {bottle.tags.join(", ")}</span>}
                </div>

                <div className="card__actions">
                  {!bottle.deletedAt && (
                    <>
                      <button type="button" onClick={() => startEdit(bottle)}>{t("actions.edit")}</button>
                      <button type="button" className="ghost" onClick={() => deleteMutation.mutate(bottle.id)}>
                        {t("actions.delete")}
                      </button>
                    </>
                  )}
                  {bottle.deletedAt && (
                    <button type="button" className="primary" onClick={() => restoreMutation.mutate(bottle.id)}>
                      {t("actions.restore")}
                    </button>
                  )}
                </div>

                {bottle.id.startsWith("temp-") && <p className="muted">{t("list.optimistic")}</p>}
              </article>
            ))}
          </div>
        )}
      </section>

      {feedback && <div className="toast">{feedback}</div>}
    </div>
  );
}

function Field({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) {
  return (
    <label className="field">
      <span>
        {label}
        {required && <span className="field__required">*</span>}
      </span>
      {children}
    </label>
  );
}
