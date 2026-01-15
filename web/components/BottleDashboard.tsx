"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { createBottle, deleteBottle, fetchBottles, updateBottle } from "../lib/bottles/client";
import { useCellars } from "../lib/cellars/store";
import {
  type BottleInput,
  type BottleRecord
} from "../lib/bottles/schema";
import { useTranslations } from "../lib/i18n/I18nProvider";
import { AppHeaderClient } from "./AppHeaderClient";
import { LocaleSync } from "./LocaleSync";
import { BottleList } from "./BottleList";
import { BottleForm } from "./BottleForm";

const queryKey = ["bottles"] as const;

type Context = {
  previous?: BottleRecord[];
  tempId?: string;
  lastDeletedId?: string;
};

export function BottleDashboard() {
  const { t } = useTranslations();
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isFormVisible, setIsFormVisible] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [feedbackAction, setFeedbackAction] = useState<(() => void) | null>(null);

  const { data: cellars = [] } = useCellars();

  const showToast = (message: string, action?: () => void) => {
    setTimeout(() => setFeedback(message), 0);
    setFeedbackAction(() => action || null);
    setTimeout(() => {
      setTimeout(() => setFeedback(null), 0);
      setFeedbackAction(null);
    }, 6000);
  };

  const { data: bottles = [], isLoading, isError, error } = useQuery({ queryKey, queryFn: () => fetchBottles() });

  useEffect(() => {
    if (bottles && !Array.isArray(bottles)) {
      console.error("BottleDashboard: bottles is not an array:", bottles);
    }
  }, [bottles]);

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
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ["cellars"] });
    }
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
        updatedAt: new Date().toISOString()
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
      queryClient.setQueryData<BottleRecord[]>(queryKey, (current = []) =>
        current.filter((item) => item.id !== id)
      );
      showToast(t("feedback.permanentlyDeleted"));
      return { ...context, lastDeletedId: id } satisfies Context;
    },
    onError: (error, _variables, context) => {
      commonMutateConfig.onError?.(error, _variables, context);
      const errorMessage = error instanceof Error ? error.message : t("feedback.deleteError");
      showToast(errorMessage);
    },
    onSettled: commonMutateConfig.onSettled
  });

  const handleSave = (data: BottleInput) => {
    if (editingId) {
      updateMutation.mutate({ id: editingId, payload: data });
      setEditingId(null);
    } else {
      createMutation.mutate(data);
    }
    setIsFormVisible(false);
  };

  const editingBottle = editingId ? (Array.isArray(bottles) ? bottles : []).find(b => b.id === editingId) ?? null : null;

  return (
    <>

      <LocaleSync />

      <section className="panel">
        <header className="panel__header">
          <div>
            <p className="eyebrow">{t("app.collection")}</p>
            <h2>{t("dashboard.overview")}</h2>
          </div>
          <div className="actions-inline">
            {!isFormVisible && !editingId && cellars.some(c => ["aging", "service", "multizone", "combined", "hybrid", "natural", "other"].includes(c.cellarType)) && (
              <button className="primary" onClick={() => setIsFormVisible(true)}>
                {t("actions.addBottle")}
              </button>
            )}
          </div>
        </header>

        {(() => {
          const activeBottles = Array.isArray(bottles) ? bottles : [];
          // Calculate total bottles by summing quantity
          const totalBottles = activeBottles.reduce((acc, b) => acc + (b.quantity || 1), 0);

          // Calculate total value (price * quantity)
          const totalValue = activeBottles.reduce((acc, b) => {
            const price = b.estimatedValue || b.purchasePrice || 0;
            return acc + (price * (b.quantity || 1));
          }, 0);

          // Calculate 'to drink' count taking quantity into account
          const toDrink = activeBottles.reduce((acc, b) => {
            if (b.peakMaturity?.to && b.peakMaturity.to <= new Date().getFullYear()) {
              return acc + (b.quantity || 1);
            }
            return acc;
          }, 0);

          return (
            <div className="stats-grid">
              <div className="stat-card">
                <span className="stat-card__label">{t("stats.totalBottles")}</span>
                <span className="stat-card__value">{totalBottles}</span>
              </div>
              <div className="stat-card">
                <span className="stat-card__label">{t("stats.totalValue")}</span>
                <span className="stat-card__value">€{totalValue.toLocaleString()}</span>
              </div>
              <div className="stat-card">
                <span className="stat-card__label">{t("stats.toDrink")}</span>
                <span className="stat-card__value">{toDrink}</span>
              </div>
            </div>
          );
        })()}
      </section>

      {(isFormVisible || editingId) && (
        <BottleForm
          cellars={cellars}
          initialData={editingBottle}
          onSave={handleSave}
          onCancel={() => {
            setEditingId(null);
            setIsFormVisible(false);
          }}
        />
      )}

      <section className="panel">
        <header className="panel__header">
          <div>
            <p className="eyebrow">{t("app.inventory")}</p>
            <h2>{t("list.title")}</h2>
          </div>
        </header>

        <BottleList
          bottles={Array.isArray(bottles) ? bottles : []}
          isLoading={isLoading}
          onEdit={(bottle) => setEditingId(bottle.id)}
          onDelete={(id) => deleteMutation.mutate(id)}
        />
      </section>

      {feedback && (
        <div className="toast" role="status" aria-live="polite">
          <span>{feedback}</span>
          {feedbackAction && (
            <button type="button" className="toast__action" onClick={() => { feedbackAction(); setTimeout(() => setFeedback(null), 0); setTimeout(() => setFeedbackAction(null), 0); }}>
              {t("actions.undo")}
            </button>
          )}
        </div>
      )}
    </>
  );
}
