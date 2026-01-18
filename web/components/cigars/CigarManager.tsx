"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { bottlesClient } from "../../lib/bottles/client";
import { useCellars } from "../../lib/cellars/store";
import {
    type BottleInput,
    type BottleRecord
} from "../../lib/bottles/schema";
import { useTranslations } from "../../lib/i18n/I18nProvider";
import { LocaleSync } from "../LocaleSync";
import { BottleList } from "../BottleList";
import { BottleForm } from "../BottleForm";
import { PlusIcon } from "../Icon";
import { ViewSwitch, ViewMode } from "../ViewSwitch";

const STORAGE_KEY = "glou_cigars_view_mode";

const queryKey = ["cigars"] as const;

type Context = {
    previous?: BottleRecord[];
    tempId?: string;
    lastDeletedId?: string;
};

export function CigarManager() {
    const { t } = useTranslations();
    const searchParams = useSearchParams();
    const router = useRouter();
    const pathname = usePathname();
    const queryClient = useQueryClient();
    const [editingId, setEditingId] = useState<string | null>(null);
    const [viewingId, setViewingId] = useState<string | null>(null);
    const [isFormVisible, setIsFormVisible] = useState(false);
    const [feedback, setFeedback] = useState<string | null>(null);
    const [feedbackAction, setFeedbackAction] = useState<(() => void) | null>(null);
    const [viewMode, setViewMode] = useState<ViewMode>("grid");

    useEffect(() => {
        const savedMode = localStorage.getItem(STORAGE_KEY) as ViewMode;
        if (savedMode) {
            setViewMode(savedMode);
        }
    }, []);

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
            setIsFormVisible(true);
            // Clean up URL
            const params = new URLSearchParams(searchParams.toString());
            params.delete("new");
            router.replace(`${pathname}?${params.toString()}`);
        }
    }, [searchParams, router, pathname]);

    const { data: cigars = [], isLoading } = useQuery({
        queryKey,
        queryFn: async () => {
            const allItems = await bottlesClient.list();
            return allItems.filter(item => item.category === 'cigar');
        }
    });

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
        mutationFn: (payload: BottleInput) => {
            return bottlesClient.create(payload);
        },
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
        mutationFn: ({ id, payload }: { id: string; payload: BottleInput }) => {
            return bottlesClient.update(id, payload);
        },
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
        mutationFn: async (id: string) => {
            return bottlesClient.delete(id);
        },
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

    const editingCigar = editingId ? cigars.find(b => b.id === editingId) ?? null : null;
    const viewingCigar = viewingId ? cigars.find(b => b.id === viewingId) ?? null : null;

    // Filter cellars that support cigars
    const cigarCellars = cellars.filter(c => ["combined", "hybrid", "cigar", "other"].includes(c.cellarType));

    return (
        <>
            <LocaleSync />

            {(isFormVisible || editingId || viewingId) && (
                <BottleForm
                    cellars={cellars}
                    initialData={editingCigar || viewingCigar}
                    defaultCategory="cigar"
                    fixedCategory="cigar"
                    onSave={handleSave}
                    onCancel={() => {
                        setEditingId(null);
                        setViewingId(null);
                        setIsFormVisible(false);
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
                    <div className="actions-inline" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                        <ViewSwitch value={viewMode} onChange={setViewMode} storageKey={STORAGE_KEY} />
                        {!isFormVisible && !editingId && cigarCellars.length > 0 && (
                            <button className="primary btn-icon" onClick={() => setIsFormVisible(true)} title={t("actions.addBottle").replace("bouteille", "cigare").replace("Bottle", "Cigar")}>
                                <PlusIcon />
                            </button>
                        )}
                        {!isFormVisible && !editingId && cigarCellars.length === 0 && (
                            <div className="muted text-sm">{t("errors.noTobaccoCellar")}</div>
                        )}
                    </div>
                </header>

                <BottleList
                    bottles={cigars}
                    isLoading={isLoading}
                    onView={(cigar) => setViewingId(cigar.id)}
                    onEdit={(cigar) => setEditingId(cigar.id)}
                    onDelete={(id) => deleteMutation.mutate(id)}
                    viewMode={viewMode}
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
