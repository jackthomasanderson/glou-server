"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { createBottle, deleteBottle, fetchBottles, restoreBottle, updateBottle } from "../lib/bottles/client";
import { getDaysUntilPermanentDelete } from "../lib/bottles/trash";
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
  alertStatus: "none" as BottleInput["alertStatus"],
  tastingNote: "",
  purchasePlace: "",
  purchasePrice: undefined as number | undefined
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
        servingTemp: "",
        bottlingDate: "",
        baseYear: undefined
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
        humidifier: "",
        manufactureYear: undefined
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
        carafing: "",
        requiresAeration: false
      };
  }
};

type Context = {
  previous?: BottleRecord[];
  tempId?: string;
  lastDeletedId?: string;
};

export function BottleDashboard() {
  const { t } = useTranslations();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<BottleInput>(() => buildDefaults("wine"));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showOptionals, setShowOptionals] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [feedbackAction, setFeedbackAction] = useState<(() => void) | null>(null);

  const showToast = (message: string, action?: () => void) => {
    setFeedback(message);
    setFeedbackAction(() => action || null);
    setTimeout(() => {
      setFeedback(null);
      setFeedbackAction(null);
    }, 6000);
  };

  const getDaysUntilDelete = (deletedAt: string | null): number | null =>
    getDaysUntilPermanentDelete(deletedAt);

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
      const errorMessage = error instanceof Error ? error.message : t("feedback.saveError");
      showToast(errorMessage);
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
      const errorMessage = error instanceof Error ? error.message : t("feedback.saveError");
      showToast(errorMessage);
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
      showToast(t("feedback.optimisticDelete"), () => restoreMutation.mutate(id));
      return { ...context, lastDeletedId: id } satisfies Context;
    },
    onError: (error, _variables, context) => {
      commonMutateConfig.onError?.(error, _variables, context);
      const errorMessage = error instanceof Error ? error.message : t("feedback.deleteError");
      showToast(errorMessage);
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
      const errorMessage = error instanceof Error ? error.message : t("feedback.restoreError");
      showToast(errorMessage);
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
      alertStatus: form.alertStatus,
      tastingNote: form.tastingNote,
      purchasePlace: form.purchasePlace,
      purchasePrice: form.purchasePrice
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
    const { id, createdAt, updatedAt, deletedAt, ...input } = record;
    void createdAt;
    void updatedAt;
    void deletedAt;
    setForm(input as BottleInput);
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
            <Field label={t("fields.house")} required hint={t("hints.house")}
            >
              <input value={sparklingForm.house} onChange={(e) => setForm((prev) => ({ ...prev, house: e.target.value }))} />
            </Field>
            <Field label={t("fields.sparkling.name")} required hint={t("hints.sparklingName")}
            >
              <input value={sparklingForm.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} />
            </Field>
            <Field label={t("fields.vintageOrNone")} hint={t("hints.vintageOrNone")}
            >
              <input
                value={sparklingForm.vintageOrNone}
                onChange={(e) => setForm((prev) => ({ ...prev, vintageOrNone: e.target.value }))}
              />
            </Field>
          </div>
        );
      }
      case "spirit": {
        const spiritForm = form as SpiritInput;
        return (
          <div className="grid">
            <Field label={t("fields.distillery")} required hint={t("hints.distillery")}
            >
              <input value={spiritForm.distillery} onChange={(e) => setForm((prev) => ({ ...prev, distillery: e.target.value }))} />
            </Field>
            <Field label={t("fields.spirit.nameEdition")} required hint={t("hints.nameEdition")}
            >
              <input value={spiritForm.nameEdition} onChange={(e) => setForm((prev) => ({ ...prev, nameEdition: e.target.value }))} />
            </Field>
            <Field label={t("fields.abv")} required hint={t("hints.abv")}
            >
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
            <Field label={t("fields.brand")} required hint={t("hints.brand")}
            >
              <input value={cigarForm.brand} onChange={(e) => setForm((prev) => ({ ...prev, brand: e.target.value }))} />
            </Field>
            <Field label={t("fields.format")} required hint={t("hints.formatCigar")}
            >
              <input value={cigarForm.format} onChange={(e) => setForm((prev) => ({ ...prev, format: e.target.value }))} />
            </Field>
            <Field label={t("fields.quantity")} required hint={t("hints.quantity")}
            >
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
            <Field label={t("fields.producer")} required hint={t("hints.producer")}
            >
              <input value={wineForm.producer} onChange={(e) => setForm((prev) => ({ ...prev, producer: e.target.value }))} />
            </Field>
            <Field label={t("fields.wine.name")} required hint={t("hints.wineName")}
            >
              <input value={wineForm.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} />
            </Field>
            <Field label={t("fields.vintageOrNone")} hint={t("hints.vintageOrNone")}
            >
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
            <Field label={t("fields.style")} hint={t("hints.style")}>
              <input value={sparklingForm.style ?? ""} onChange={(e) => setForm((prev) => ({ ...prev, style: e.target.value }))} />
            </Field>
            <Field label={t("fields.dosage")} hint={t("hints.dosage")}>
              <input value={sparklingForm.dosage ?? ""} onChange={(e) => setForm((prev) => ({ ...prev, dosage: e.target.value }))} />
            </Field>
            <Field label={t("fields.disgorgement")} hint={t("hints.disgorgement")}>
              <input value={sparklingForm.disgorgement ?? ""} onChange={(e) => setForm((prev) => ({ ...prev, disgorgement: e.target.value }))} />
            </Field>
            <Field label={t("fields.pressure")} hint={t("hints.pressure")}>
              <input value={sparklingForm.pressure ?? ""} onChange={(e) => setForm((prev) => ({ ...prev, pressure: e.target.value }))} />
            </Field>
            <Field label={t("fields.baseWine")} hint={t("hints.baseWine")}>
              <input value={sparklingForm.baseWine ?? ""} onChange={(e) => setForm((prev) => ({ ...prev, baseWine: e.target.value }))} />
            </Field>
            <Field label={t("fields.servingTemp")} hint={t("hints.servingTemp")}>
              <input value={sparklingForm.servingTemp ?? ""} onChange={(e) => setForm((prev) => ({ ...prev, servingTemp: e.target.value }))} />
            </Field>
            <Field label={t("fields.bottlingDate")} hint={t("hints.bottlingDate")}>
              <input value={sparklingForm.bottlingDate ?? ""} onChange={(e) => setForm((prev) => ({ ...prev, bottlingDate: e.target.value }))} />
            </Field>
            <Field label={t("fields.baseYear")} hint={t("hints.baseYear")}>
              <input
                type="number"
                min={1900}
                max={2100}
                value={sparklingForm.baseYear ?? ""}
                onChange={(e) => setForm((prev) => ({ ...prev, baseYear: e.target.value ? Number(e.target.value) : undefined }))}
              />
            </Field>
          </div>
        );
      }
      case "spirit": {
        const spiritForm = form as SpiritInput;
        return (
          <div className="grid">
            <Field label={t("fields.ageStatement")} hint={t("hints.ageStatement")}>
              <input value={spiritForm.ageStatement ?? ""} onChange={(e) => setForm((prev) => ({ ...prev, ageStatement: e.target.value }))} />
            </Field>
            <Field label={t("fields.caskType")} hint={t("hints.caskType")}>
              <input value={spiritForm.caskType ?? ""} onChange={(e) => setForm((prev) => ({ ...prev, caskType: e.target.value }))} />
            </Field>
            <Field label={t("fields.batch")} hint={t("hints.batch")}>
              <input value={spiritForm.batch ?? ""} onChange={(e) => setForm((prev) => ({ ...prev, batch: e.target.value }))} />
            </Field>
            <Field label={t("fields.additiveNote")} hint={t("hints.additiveNote")}>
              <input value={spiritForm.additiveNote ?? ""} onChange={(e) => setForm((prev) => ({ ...prev, additiveNote: e.target.value }))} />
            </Field>
            <Field label={t("fields.angelShare")} hint={t("hints.angelShare")}>
              <input value={spiritForm.angelShare ?? ""} onChange={(e) => setForm((prev) => ({ ...prev, angelShare: e.target.value }))} />
            </Field>
            <Field label={t("fields.aromaProfile")} hint={t("hints.aromaProfile")}>
              <input value={spiritForm.aromaProfile ?? ""} onChange={(e) => setForm((prev) => ({ ...prev, aromaProfile: e.target.value }))} />
            </Field>
          </div>
        );
      }
      case "cigar": {
        const cigarForm = form as CigarInput;
        return (
          <div className="grid">
            <Field label={t("fields.wrapper")} hint={t("hints.wrapper")}>
              <input value={cigarForm.wrapper ?? ""} onChange={(e) => setForm((prev) => ({ ...prev, wrapper: e.target.value }))} />
            </Field>
            <Field label={t("fields.binder")} hint={t("hints.binder")}>
              <input value={cigarForm.binder ?? ""} onChange={(e) => setForm((prev) => ({ ...prev, binder: e.target.value }))} />
            </Field>
            <Field label={t("fields.filler")} hint={t("hints.filler")}>
              <input value={cigarForm.filler ?? ""} onChange={(e) => setForm((prev) => ({ ...prev, filler: e.target.value }))} />
            </Field>
            <Field label={t("fields.factoryCode")} hint={t("hints.factoryCode")}>
              <input value={cigarForm.factoryCode ?? ""} onChange={(e) => setForm((prev) => ({ ...prev, factoryCode: e.target.value }))} />
            </Field>
            <Field label={t("fields.targetHumidity")} hint={t("hints.targetHumidity")}>
              <input value={cigarForm.targetHumidity ?? ""} onChange={(e) => setForm((prev) => ({ ...prev, targetHumidity: e.target.value }))} />
            </Field>
            <Field label={t("fields.humidifier")} hint={t("hints.humidifier")}>
              <input value={cigarForm.humidifier ?? ""} onChange={(e) => setForm((prev) => ({ ...prev, humidifier: e.target.value }))} />
            </Field>
            <Field label={t("fields.manufactureYear")} hint={t("hints.manufactureYear")}>
              <input
                type="number"
                min={1900}
                max={2100}
                value={cigarForm.manufactureYear ?? ""}
                onChange={(e) => setForm((prev) => ({ ...prev, manufactureYear: e.target.value ? Number(e.target.value) : undefined }))}
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
            <Field label={t("fields.color")} hint={t("hints.color")}>
              <input value={wineForm.color ?? ""} onChange={(e) => setForm((prev) => ({ ...prev, color: e.target.value }))} />
            </Field>
            <Field label={t("fields.appellation")} hint={t("hints.appellation")}>
              <input value={wineForm.appellation ?? ""} onChange={(e) => setForm((prev) => ({ ...prev, appellation: e.target.value }))} />
            </Field>
            <Field label={t("fields.grapes")} hint={t("hints.grapes")}>
              <input value={wineForm.grapes ?? ""} onChange={(e) => setForm((prev) => ({ ...prev, grapes: e.target.value }))} />
            </Field>
            <Field label={t("fields.abv")} hint={t("hints.abv")}
            >
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
            <Field label={t("fields.format")} hint={t("hints.formatBottle")}
            >
              <input value={wineForm.format ?? ""} onChange={(e) => setForm((prev) => ({ ...prev, format: e.target.value }))} />
            </Field>
            <Field label={t("fields.servingTemp")} hint={t("hints.servingTemp")}
            >
              <input value={wineForm.servingTemp ?? ""} onChange={(e) => setForm((prev) => ({ ...prev, servingTemp: e.target.value }))} />
            </Field>
            <Field label={t("fields.lotNumber")} hint={t("hints.lotNumber")}
            >
              <input value={wineForm.lotNumber ?? ""} onChange={(e) => setForm((prev) => ({ ...prev, lotNumber: e.target.value }))} />
            </Field>
            <Field label={t("fields.carafing")} hint={t("hints.carafing")}
            >
              <input value={wineForm.carafing ?? ""} onChange={(e) => setForm((prev) => ({ ...prev, carafing: e.target.value }))} />
            </Field>
            <Field label={t("fields.requiresAeration")} hint={t("hints.requiresAeration")}
            >
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={wineForm.requiresAeration ?? false}
                  aria-label={t("fields.requiresAeration")}
                  onChange={(e) => setForm((prev) => ({ ...prev, requiresAeration: e.target.checked }))}
                />
              </label>
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
      aria-label={t("fields.fillLevel")}
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

  const renderCommonOptionalFields = () => (
    <div className="grid">
      <Field label={t("fields.tags")} hint={t("hints.tags")}>
        {renderTagInput()}
      </Field>
      <Field label={t("fields.photoUrl")} hint={t("hints.photoUrl")}>
        <input value={form.photoUrl ?? ""} onChange={(e) => setForm((prev) => ({ ...prev, photoUrl: e.target.value }))} />
      </Field>
      <Field label={t("fields.estimatedValue")} hint={t("hints.estimatedValue")}>
        <input
          type="number"
          min={0}
          step={1}
          value={form.estimatedValue ?? ""}
          onChange={(e) => setForm((prev) => ({ ...prev, estimatedValue: e.target.value ? Number(e.target.value) : undefined }))}
        />
      </Field>
      <Field label={t("fields.purchasePrice")} hint={t("hints.purchasePrice")}>
        <input
          type="number"
          min={0}
          step={1}
          value={form.purchasePrice ?? ""}
          onChange={(e) => setForm((prev) => ({ ...prev, purchasePrice: e.target.value ? Number(e.target.value) : undefined }))}
        />
      </Field>
      <Field label={t("fields.purchasePlace")} hint={t("hints.purchasePlace")}>
        <input
          value={form.purchasePlace ?? ""}
          onChange={(e) => setForm((prev) => ({ ...prev, purchasePlace: e.target.value }))}
        />
      </Field>
      <Field label={t("fields.tastingNote")} hint={t("hints.tastingNote")}>
        <textarea
          value={form.tastingNote ?? ""}
          onChange={(e) => setForm((prev) => ({ ...prev, tastingNote: e.target.value }))}
          rows={3}
        />
      </Field>
      <Field label={t("fields.fillLevel")} hint={t("hints.fillLevel")}>{renderFillLevelSelect()}</Field>
      <Field label={t("fields.isOpened")} hint={t("hints.isOpened")}>
        <label className="toggle">
          <input
            type="checkbox"
            checked={form.isOpened ?? false}
            aria-label={t("fields.isOpened")}
            onChange={(e) => setForm((prev) => ({ ...prev, isOpened: e.target.checked }))}
          />
          <span>{form.isOpened ? t("list.opened") : t("list.closed")}</span>
        </label>
      </Field>
      <Field label={t("fields.peakFrom")} hint={t("hints.peakFrom")}>
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
      <Field label={t("fields.peakTo")} hint={t("hints.peakTo")}>
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
      <Field label={t("fields.alertStatus")} hint={t("hints.alertStatus")}>
        <select
          value={form.alertStatus ?? "none"}
          onChange={(e) => setForm((prev) => ({ ...prev, alertStatus: e.target.value as BottleInput["alertStatus"] }))}
        >
          <option value="none">{t("alerts.none")}</option>
          <option value="approaching">{t("alerts.approaching")}</option>
          <option value="critical">{t("alerts.critical")}</option>
        </select>
      </Field>
    </div>
  );

  const renderPreviewCard = () => (
    <article className="card card--muted" aria-label={t("preview.title")}>
      <div className="card__header">
        <div>
          <p className="eyebrow">{t(`categories.${form.category}`)}</p>
          <h3>{form.label || t("preview.placeholder")}</h3>
        </div>
        <div className="pills">
          {form.isOpened ? <span className="pill info">{t("list.opened")}</span> : null}
          {form.fillLevel ? <span className="pill">{t(`levels.${form.fillLevel}`)}</span> : null}
          {form.alertStatus && form.alertStatus !== "none" ? (
            <span className="pill danger">{t(`alerts.${form.alertStatus}`)}</span>
          ) : null}
        </div>
      </div>
      <div className="card__meta">
        {form.category === "wine" && (
          <span>{(form as WineInput).producer} • {(form as WineInput).name} • {(form as WineInput).vintageOrNone}</span>
        )}
        {form.category === "sparkling" && (
          <span>{(form as SparklingInput).house} • {(form as SparklingInput).name} • {(form as SparklingInput).vintageOrNone}</span>
        )}
        {form.category === "spirit" && (
          <span>{(form as SpiritInput).distillery} • {(form as SpiritInput).nameEdition} • {(form as SpiritInput).abv ?? 0}%</span>
        )}
        {form.category === "cigar" && (() => {
          const cigarInput = form as CigarInput;
          const parts = [] as string[];
          if (cigarInput.brand) parts.push(cigarInput.brand);
          if (cigarInput.format) parts.push(cigarInput.format);
          if (cigarInput.quantity && (cigarInput.brand || cigarInput.format)) {
            parts.push(String(cigarInput.quantity));
          }
          return parts.length > 0 ? <span>{parts.join(" • ")}</span> : null;
        })()}
        {form.estimatedValue !== undefined && <span>{t("list.value")}: €{form.estimatedValue}</span>}
        {form.purchasePrice !== undefined && <span>{t("list.purchasePrice")}: €{form.purchasePrice}</span>}
        {form.location && <span>{t("list.location")}: {form.location}</span>}
        {form.collection && <span>{t("list.collection")}: {form.collection}</span>}
        {form.tags && form.tags.length > 0 && <span>{t("list.tags")}: {form.tags.join(", ")}</span>}
        {form.tastingNote && <span>{t("list.tastingNote")}: {form.tastingNote}</span>}
      </div>
    </article>
  );

  return (
    <div className="dashboard">
      <LocaleSync />
      <AppHeaderClient />
      
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
              <Field label={t("fields.label")} required hint={t("hints.label")}
              >
                <input value={form.label} onChange={(e) => setForm((prev) => ({ ...prev, label: e.target.value }))} />
              </Field>
              <Field label={t("fields.category")} required hint={t("hints.category")}
              >
                <select value={form.category} onChange={(e) => handleCategoryChange(e.target.value as BottleCategory)}>
                  <option value="wine">{t("categories.wine")}</option>
                  <option value="sparkling">{t("categories.sparkling")}</option>
                  <option value="spirit">{t("categories.spirit")}</option>
                  <option value="cigar">{t("categories.cigar")}</option>
                </select>
              </Field>
              <Field label={t("fields.location")} hint={t("hints.location")}
              >
                <input value={form.location ?? ""} onChange={(e) => setForm((prev) => ({ ...prev, location: e.target.value }))} />
              </Field>
              <Field label={t("fields.collection")} hint={t("hints.collection")}
              >
                <input value={form.collection ?? ""} onChange={(e) => setForm((prev) => ({ ...prev, collection: e.target.value }))} />
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
              <button
                type="button"
                className="ghost"
                aria-expanded={showOptionals}
                aria-controls="optional-fields"
                onClick={() => setShowOptionals((prev) => !prev)}
              >
                {showOptionals ? t("optionals.hide") : t("optionals.show")}
              </button>
            </div>
            {showOptionals && (
              <div id="optional-fields">
                <p className="section__hint">{t("sections.common")}</p>
                {renderCommonOptionalFields()}
                <p className="section__hint">{t("sections.category")}</p>
                {optionalFields}
              </div>
            )}
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

          <div className="section">
            <div className="section__title">{t("preview.title")}</div>
            {renderPreviewCard()}
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
                  {bottle.purchasePrice !== undefined && (
                    <span>{t("list.purchasePrice")}: €{bottle.purchasePrice}</span>
                  )}
                  {bottle.purchasePlace && <span>{t("list.purchasePlace")}: {bottle.purchasePlace}</span>}
                  {bottle.peakMaturity && (bottle.peakMaturity.from || bottle.peakMaturity.to) && (
                    <span>
                      {t("list.peak")}: {bottle.peakMaturity.from ?? "?"} – {bottle.peakMaturity.to ?? "?"}
                    </span>
                  )}
                  {bottle.location && <span>{t("list.location")}: {bottle.location}</span>}
                  {bottle.collection && <span>{t("list.collection")}: {bottle.collection}</span>}
                  {bottle.tags && bottle.tags.length > 0 && <span>{t("list.tags")}: {bottle.tags.join(", ")}</span>}
                  {bottle.tastingNote && <span>{t("list.tastingNote")}: {bottle.tastingNote}</span>}
                  {bottle.deletedAt && (
                    <span className="muted">{t("trash.expiresIn")}: {getDaysUntilDelete(bottle.deletedAt) || "0"} {t("trash.days")}</span>
                  )}
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

      {feedback && (
        <div className="toast" role="status" aria-live="polite">
          <span>{feedback}</span>
          {feedbackAction && (
            <button type="button" className="toast__action" onClick={() => { feedbackAction(); setFeedback(null); setFeedbackAction(null); }}>
              {t("actions.undo")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Field({ label, children, required, hint }: { label: string; children: React.ReactNode; required?: boolean; hint?: string }) {
  return (
    <label className="field">
      <span className="field__label">
        {label}
        {required && <span className="field__required">*</span>}
        {hint ? (
          <span className="field__hint" aria-label={hint} title={hint}>i</span>
        ) : null}
      </span>
      {children}
    </label>
  );
}
