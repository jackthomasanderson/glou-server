"use client";

import { useState } from "react";
import { useTranslations } from "../lib/i18n/I18nProvider";
import { useActiveObjective, useDeleteObjective } from "../lib/api/consumption";
import { ObjectivesForm } from "./ObjectivesForm";
import { WeeklyPlan } from "./WeeklyPlan";
import { ConsumptionSuggestions } from "./ConsumptionSuggestions";
import { ConsumptionHistory } from "./ConsumptionHistory";
import {
    Box,
    Typography,
    Button,
    Stack,
    Card,
    CardContent,
    Chip,
    IconButton,
    Tabs,
    Tab,
    Alert,
} from "@mui/material";
import {
    Add as AddIcon,
    Edit as EditIcon,
    Delete as DeleteIcon,
    CalendarMonth as CalendarIcon,
    History as HistoryIcon,
    AutoAwesome as SuggestionsIcon,
} from "@mui/icons-material";

export function ConsumptionPlanManager() {
    const { t } = useTranslations();
    const { data: objective, isLoading } = useActiveObjective();
    const deleteObjective = useDeleteObjective();

    const [objectiveFormOpen, setObjectiveFormOpen] = useState(false);
    const [activeTab, setActiveTab] = useState(0);

    const handleDelete = async () => {
        if (objective?.id && confirm(t("security.confirmAction"))) {
            await deleteObjective.mutateAsync(objective.id);
        }
    };

    return (
        <Box>
            <Box sx={{ mb: 4 }}>
                <Typography variant="h4" fontWeight={700} sx={{ mb: 1 }}>
                    {t("consumption.title")}
                </Typography>
                <Typography variant="body1" color="text.secondary">
                    {t("consumption.subtitle")}
                </Typography>
            </Box>

            {/* Objective Card */}
            {objective ? (
                <Card sx={{ mb: 3, borderRadius: 3 }}>
                    <CardContent>
                        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                            <Box>
                                <Typography variant="caption" color="text.secondary" textTransform="uppercase">
                                    {t("consumption.objective.current")}
                                </Typography>
                                <Typography variant="h6" fontWeight={600} sx={{ mb: 1 }}>
                                    {objective.targetCount} {t("stats.totalBottles")} / {t(`consumption.objective.${objective.period}`)}
                                </Typography>
                                <Stack direction="row" spacing={1}>
                                    {objective.prioritizeOpened && (
                                        <Chip label={t("consumption.objective.prioritizeOpened")} size="small" variant="outlined" />
                                    )}
                                    {objective.prioritizeCollections && objective.prioritizeCollections.length > 0 && (
                                        <Chip
                                            label={`${objective.prioritizeCollections.length} ${t("fields.collection")}`}
                                            size="small"
                                            variant="outlined"
                                        />
                                    )}
                                    {objective.maxBudgetPerBottle && (
                                        <Chip label={`Max ${objective.maxBudgetPerBottle}€`} size="small" variant="outlined" />
                                    )}
                                </Stack>
                            </Box>
                            <Stack direction="row" spacing={1}>
                                <IconButton size="small" onClick={() => setObjectiveFormOpen(true)} color="primary">
                                    <EditIcon fontSize="small" />
                                </IconButton>
                                <IconButton size="small" onClick={handleDelete} color="error">
                                    <DeleteIcon fontSize="small" />
                                </IconButton>
                            </Stack>
                        </Box>
                    </CardContent>
                </Card>
            ) : (
                <Alert
                    severity="info"
                    sx={{ mb: 3 }}
                    action={
                        <Button
                            color="inherit"
                            size="small"
                            startIcon={<AddIcon />}
                            onClick={() => setObjectiveFormOpen(true)}
                        >
                            {t("consumption.objective.create")}
                        </Button>
                    }
                >
                    {t("consumption.objective.noActive")}
                </Alert>
            )}

            {/* Tabs */}
            <Box sx={{ borderBottom: 1, borderColor: "divider", mb: 3 }}>
                <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)}>
                    <Tab icon={<SuggestionsIcon />} label={t("consumption.tabs.suggestions")} iconPosition="start" />
                    <Tab icon={<CalendarIcon />} label={t("consumption.tabs.weekly")} iconPosition="start" />
                    <Tab icon={<HistoryIcon />} label={t("consumption.tabs.history")} iconPosition="start" />
                </Tabs>
            </Box>

            {/* Tab Panels */}
            <Box role="tabpanel" hidden={activeTab !== 0}>
                {activeTab === 0 && <ConsumptionSuggestions />}
            </Box>
            <Box role="tabpanel" hidden={activeTab !== 1}>
                {activeTab === 1 && <WeeklyPlan />}
            </Box>
            <Box role="tabpanel" hidden={activeTab !== 2}>
                {activeTab === 2 && <ConsumptionHistory />}
            </Box>

            {/* Objective Form Dialog */}
            <ObjectivesForm
                open={objectiveFormOpen}
                onClose={() => setObjectiveFormOpen(false)}
                existingObjective={objective}
            />
        </Box>
    );
}
