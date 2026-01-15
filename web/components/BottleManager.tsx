"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { createBottle, deleteBottle, fetchBottles, updateBottle } from "../lib/bottles/client";
import { useCellars } from "../lib/cellars/store";
import {
    type BottleCategory,
    type BottleInput,
    type BottleRecord
} from "../lib/bottles/schema";
import { useTranslations } from "../lib/i18n/I18nProvider";
import { LocaleSync } from "./LocaleSync";
import { BottleList } from "./BottleList";
import { BottleForm } from "./BottleForm";
import { PlusIcon } from "./Icon";

const queryKey = ["bottles"] as const;

type Context = {
    previous?: BottleRecord[];
    tempId?: string;
    lastDeletedId?: string;
};

export function BottleManager() {
    const { t } = useTranslations();
    const searchParams = useSearchParams();
    const router = useRouter();
    const pathname = usePathname();
    const queryClient = useQueryClient();
    const [editingId, setEditingId] = useState<string | null>(null);
    const [viewingId, setViewingId] = useState<string | null>(null);
    const [isFormVisible, setIsFormVisible] = useState(false);
    const [defaultCategory, setDefaultCategory] = useState<BottleCategory>("wine");
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

    useEffect(() => {
        if (searchParams.get("new") === "true") {
            const category = searchParams.get("category") as BottleCategory | null;
            if (category && ["wine", "sparkling", "spirit", "cigar"].includes(category)) {
                setDefaultCategory(category);
            } else {
                setDefaultCategory("wine");
            }
            setIsFormVisible(true);
            // Clean up URL
            const params = new URLSearchParams(searchParams.toString());
            params.delete("new");
            params.delete("category");
            router.replace(`${pathname}?${params.toString()}`);
        }
    }, [searchParams, router, pathname]);

    const { data: bottles = [], isLoading, error } = useQuery({
        queryKey,
        queryFn: () => fetchBottles()
    });

    useEffect(() => {
        if (bottles && !Array.isArray(bottles)) {
            console.error("BottleManager: bottles is not an array:", bottles);
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

            const category = payload.category;
            const message = category === 'cigar' ? t("feedback.optimisticCreateCigar") : t("feedback.optimisticCreate");
            showToast(message || "Item created");

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
    const viewingBottle = viewingId ? (Array.isArray(bottles) ? bottles : []).find(b => b.id === viewingId) ?? null : null;

    return (
        <>
            <LocaleSync />

            {(isFormVisible || editingId || viewingId) && (
                <BottleForm
                    cellars={cellars}
                    initialData={editingBottle || viewingBottle}
                    defaultCategory={defaultCategory}
                    onSave={handleSave}
                    onCancel={() => {
                        setEditingId(null);
                        setViewingId(null);
                        setIsFormVisible(false);
                        setDefaultCategory("wine");
                    }}
                    readOnly={!!viewingId}
                />
            )}

            <section className="panel">
                <header className="panel__header">
                    <div>
                        <p className="eyebrow">{t("app.inventory")}</p>
                        <h2>{t("list.title")}</h2>
                    </div>
                    <div className="actions-inline">
                        {!isFormVisible && !editingId && cellars.some(c => ["aging", "service", "multizone", "combined", "hybrid", "natural", "other", "cigar"].includes(c.cellarType)) && (
                            <button className="primary btn-icon" onClick={() => setIsFormVisible(true)} title={t("actions.addBottle")}>
                                <PlusIcon />
                            </button>
                        )}
                    </div>
                </header>

                <BottleList
                    bottles={Array.isArray(bottles) ? bottles : []}
                    isLoading={isLoading}
                    onView={(bottle) => setViewingId(bottle.id)}
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
