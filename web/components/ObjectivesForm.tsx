"use client";

import { useState } from "react";
import { useTranslations } from "../lib/i18n/I18nProvider";
import {
    useCreateObjective,
    useUpdateObjective,
    useActiveObjective,
    type ConsumptionObjective,
} from "../lib/api/consumption";
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    TextField,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    FormControlLabel,
    Checkbox,
    Box,
    Typography,
    Chip,
    Stack,
    Alert,
} from "@mui/material";

interface ObjectivesFormProps {
    open: boolean;
    onClose: () => void;
    existingObjective?: ConsumptionObjective | null;
}

export function ObjectivesForm({
    open,
    onClose,
    existingObjective,
}: ObjectivesFormProps) {
    const { t } = useTranslations();
    const createMutation = useCreateObjective();
    const updateMutation = useUpdateObjective();

    const [period, setPeriod] = useState<"week" | "month">(
        existingObjective?.period || "week"
    );
    const [targetCount, setTargetCount] = useState(
        existingObjective?.targetCount || 3
    );
    const [prioritizeOpened, setPrioritizeOpened] = useState(
        existingObjective?.prioritizeOpened || false
    );
    const [prioritizeCollections, setPrioritizeCollections] = useState<string[]>(
        existingObjective?.prioritizeCollections || []
    );
    const [maxBudget, setMaxBudget] = useState<number | undefined>(
        existingObjective?.maxBudgetPerBottle
    );
    const [collectionInput, setCollectionInput] = useState("");

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        const data = {
            period,
            targetCount,
            prioritizeOpened,
            prioritizeCollections,
            maxBudgetPerBottle: maxBudget,
        };

        try {
            if (existingObjective?.id) {
                await updateMutation.mutateAsync({ id: existingObjective.id, ...data });
            } else {
                await createMutation.mutateAsync(data);
            }
            onClose();
        } catch (error) {
            console.error("Failed to save objective:", error);
        }
    };

    const addCollection = () => {
        if (collectionInput && !prioritizeCollections.includes(collectionInput)) {
            setPrioritizeCollections([...prioritizeCollections, collectionInput]);
            setCollectionInput("");
        }
    };

    const removeCollection = (collection: string) => {
        setPrioritizeCollections(
            prioritizeCollections.filter((c) => c !== collection)
        );
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <form onSubmit={handleSubmit}>
                <DialogTitle>
                    {existingObjective ? t("consumption.objective.edit") : t("consumption.objective.create")}
                </DialogTitle>
                <DialogContent>
                    <Stack spacing={3} sx={{ mt: 1 }}>
                        <FormControl fullWidth>
                            <InputLabel>{t("consumption.objective.period")}</InputLabel>
                            <Select
                                value={period}
                                label={t("consumption.objective.period")}
                                onChange={(e) => setPeriod(e.target.value as "week" | "month")}
                            >
                                <MenuItem value="week">{t("consumption.objective.week")}</MenuItem>
                                <MenuItem value="month">{t("consumption.objective.month")}</MenuItem>
                            </Select>
                        </FormControl>

                        <TextField
                            label={t("consumption.objective.targetCount")}
                            type="number"
                            value={targetCount}
                            onChange={(e) => setTargetCount(parseInt(e.target.value))}
                            inputProps={{ min: 1 }}
                            fullWidth
                            required
                        />

                        <FormControlLabel
                            control={
                                <Checkbox
                                    checked={prioritizeOpened}
                                    onChange={(e) => setPrioritizeOpened(e.target.checked)}
                                />
                            }
                            label={t("consumption.objective.prioritizeOpened")}
                        />

                        <Box>
                            <Typography variant="subtitle2" sx={{ mb: 1 }}>
                                {t("consumption.objective.prioritizeCollections")}
                            </Typography>
                            <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
                                <TextField
                                    size="small"
                                    value={collectionInput}
                                    onChange={(e) => setCollectionInput(e.target.value)}
                                    placeholder={t("fields.collection")}
                                    onKeyPress={(e) => {
                                        if (e.key === "Enter") {
                                            e.preventDefault();
                                            addCollection();
                                        }
                                    }}
                                />
                                <Button onClick={addCollection} variant="outlined" size="small">
                                    {t("actions.add")}
                                </Button>
                            </Stack>
                            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
                                {prioritizeCollections.map((collection) => (
                                    <Chip
                                        key={collection}
                                        label={collection}
                                        onDelete={() => removeCollection(collection)}
                                        size="small"
                                    />
                                ))}
                            </Box>
                        </Box>

                        <TextField
                            label={t("consumption.objective.maxBudget")}
                            type="number"
                            value={maxBudget || ""}
                            onChange={(e) =>
                                setMaxBudget(e.target.value ? parseFloat(e.target.value) : undefined)
                            }
                            inputProps={{ min: 0, step: 0.01 }}
                            fullWidth
                            helperText={t("consumption.objective.maxBudgetHint")}
                        />

                        {(createMutation.isError || updateMutation.isError) && (
                            <Alert severity="error">
                                {t("feedback.saveError")}
                            </Alert>
                        )}
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button onClick={onClose}>{t("actions.cancel")}</Button>
                    <Button
                        type="submit"
                        variant="contained"
                        disabled={createMutation.isPending || updateMutation.isPending}
                    >
                        {existingObjective ? t("actions.update") : t("actions.save")}
                    </Button>
                </DialogActions>
            </form>
        </Dialog>
    );
}
