"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, forwardRef } from "react";
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
import {
    Box,
    Typography,
    Button,
    Paper,
    IconButton,
    Snackbar,
    Alert,
    alpha,
    useTheme,
    Dialog,
    DialogContent,
    DialogTitle,
    Slide,
} from "@mui/material";
import { Add as PlusIcon, Close as CloseIcon } from "@mui/icons-material";

const queryKey = ["bottles"] as const;

type Context = {
    previous?: BottleRecord[];
    tempId?: string;
    lastDeletedId?: string;
};

const Transition = forwardRef(function Transition(
    props: any,
    ref: React.Ref<unknown>,
) {
    return <Slide direction="up" ref={ref} {...props} />;
});

export function BottleManager() {
    const { t } = useTranslations();
    const theme = useTheme();
    const searchParams = useSearchParams();
    const router = useRouter();
    const pathname = usePathname();
    const queryClient = useQueryClient();
    const [editingId, setEditingId] = useState<string | null>(null);
    const [viewingId, setViewingId] = useState<string | null>(null);
    const [isFormVisible, setIsFormVisible] = useState(false);
    const [defaultCategory, setDefaultCategory] = useState<BottleCategory>("wine");
    const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; action?: () => void }>({
        open: false,
        message: "",
    });

    const { data: cellars = [] } = useCellars();

    const showToast = (message: string, action?: () => void) => {
        setSnackbar({ open: true, message, action });
    };

    const handleCloseSnackbar = (_?: React.SyntheticEvent | Event, reason?: string) => {
        if (reason === 'clickaway') return;
        setSnackbar(prev => ({ ...prev, open: false }));
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
            const params = new URLSearchParams(searchParams.toString());
            params.delete("new");
            params.delete("category");
            router.replace(`${pathname}?${params.toString()}`);
        }
    }, [searchParams, router, pathname]);

    const { data: bottles = [], isLoading } = useQuery({
        queryKey,
        queryFn: () => fetchBottles()
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

            {/* Form Dialog for premium feel */}
            <Dialog
                fullWidth
                maxWidth="md"
                open={isFormVisible || !!editingId || !!viewingId}
                onClose={() => {
                    setEditingId(null);
                    setViewingId(null);
                    setIsFormVisible(false);
                    setDefaultCategory("wine");
                }}
                TransitionComponent={Transition}
                PaperProps={{
                    sx: { borderRadius: 3, bgcolor: 'background.paper', p: 1 }
                }}
            >
                <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1 }}>
                    <Box component="span" sx={{ fontWeight: 800, fontSize: '1.5rem' }}>
                        {viewingId ? t("actions.view") : editingId ? t("actions.edit") : t("actions.addBottle")}
                    </Box>
                    <IconButton onClick={() => { setEditingId(null); setViewingId(null); setIsFormVisible(false); }}>
                        <CloseIcon />
                    </IconButton>
                </DialogTitle>
                <DialogContent sx={{ px: 0 }}>
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
                </DialogContent>
            </Dialog>

            <Paper sx={{ p: { xs: 2, md: 4 }, borderRadius: 3 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: { xs: 'flex-start', md: 'center' }, mb: 4, flexDirection: { xs: 'column', md: 'row' }, gap: 2 }}>
                    <Box>
                        <Typography variant="caption" sx={{ color: 'primary.main', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                            {t("app.inventory")}
                        </Typography>
                        <Typography variant="h5" sx={{ fontWeight: 700, fontSize: { xs: '1.25rem', md: '1.5rem' } }}>
                            {t("list.title")}
                        </Typography>
                    </Box>
                    <Box>
                        {!isFormVisible && !editingId && cellars.some(c => ["aging", "service", "multizone", "combined", "hybrid", "natural", "other", "cigar"].includes(c.cellarType)) && (
                            <Button
                                variant="contained"
                                startIcon={<PlusIcon />}
                                onClick={() => setIsFormVisible(true)}
                                disableElevation
                                sx={{ fontWeight: 700, borderRadius: 2, width: { xs: '100%', sm: 'auto' } }}
                            >
                                {t("actions.add")}
                            </Button>
                        )}
                    </Box>
                </Box>

                <BottleList
                    bottles={Array.isArray(bottles) ? bottles : []}
                    isLoading={isLoading}
                    onView={(bottle) => setViewingId(bottle.id)}
                    onEdit={(bottle) => setEditingId(bottle.id)}
                    onDelete={(id) => deleteMutation.mutate(id)}
                />
            </Paper>

            <Snackbar
                open={snackbar.open}
                autoHideDuration={6000}
                onClose={handleCloseSnackbar}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
            >
                <Alert
                    onClose={handleCloseSnackbar}
                    severity="info"
                    variant="filled"
                    action={
                        snackbar.action && (
                            <Button color="inherit" size="small" onClick={() => { snackbar.action?.(); handleCloseSnackbar(); }}>
                                {t("actions.undo")}
                            </Button>
                        )
                    }
                    sx={{ width: '100%', borderRadius: 2, fontWeight: 600 }}
                >
                    {snackbar.message}
                </Alert>
            </Snackbar>
        </>
    );
}
