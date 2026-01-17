"use client";

import { useTranslations } from "../lib/i18n/I18nProvider";
import { useWeeklyPlan } from "../lib/api/consumption";
import {
    Paper,
    Box,
    Typography,
    Grid,
    Card,
    CardContent,
    Chip,
    CircularProgress,
    Alert,
    LinearProgress,
    alpha,
    useTheme,
} from "@mui/material";
import { CalendarMonth as CalendarIcon } from "@mui/icons-material";

export function WeeklyPlan() {
    const { t } = useTranslations();
    const theme = useTheme();
    const { data, isLoading, error } = useWeeklyPlan();

    if (isLoading) {
        return (
            <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
                <CircularProgress />
            </Box>
        );
    }

    if (error) {
        return (
            <Alert severity="error" sx={{ mt: 3 }}>
                {t("error")}
            </Alert>
        );
    }

    if (!data) return null;

    const progressPercentage = (data.currentProgress / data.targetCount) * 100;
    const daysOfWeek = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];

    // Group suggestions by planned day
    const suggestionsByDay: Record<number, typeof data.suggestions> = {};
    for (let i = 0; i < 7; i++) {
        suggestionsByDay[i] = [];
    }
    data.suggestions.forEach((suggestion) => {
        const day = suggestion.plannedDay ?? 0;
        if (!suggestionsByDay[day]) suggestionsByDay[day] = [];
        suggestionsByDay[day].push(suggestion);
    });

    return (
        <Paper sx={{ p: 3, borderRadius: 3, mt: 3 }}>
            <Box sx={{ mb: 3 }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
                    <CalendarIcon color="primary" />
                    <Typography variant="caption" sx={{ color: "primary.main", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                        {t("consumption.weekly.title")}
                    </Typography>
                </Box>
                <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
                    {t("consumption.weekly.subtitle")}
                </Typography>

                {/* Progress */}
                <Box sx={{ mb: 3 }}>
                    <Box sx={{ display: "flex", justifyContent: "space-between", mb: 1 }}>
                        <Typography variant="body2" color="text.secondary">
                            {t("consumption.objective.progress")}
                        </Typography>
                        <Typography variant="body2" fontWeight={600}>
                            {data.currentProgress} / {data.targetCount}
                        </Typography>
                    </Box>
                    <LinearProgress
                        variant="determinate"
                        value={Math.min(progressPercentage, 100)}
                        sx={{
                            height: 8,
                            borderRadius: 4,
                            bgcolor: alpha(theme.palette.primary.main, 0.1),
                        }}
                    />
                </Box>
            </Box>

            {/* Weekly Grid */}
            <Grid container spacing={2}>
                {daysOfWeek.map((day, index) => {
                    const daySuggestions = suggestionsByDay[index] || [];
                    const hasBottles = daySuggestions.length > 0;

                    return (
                        <Grid item xs={12} sm={6} md={4} lg={12 / 7} key={index}>
                            <Card
                                sx={{
                                    minHeight: 120,
                                    bgcolor: hasBottles
                                        ? alpha(theme.palette.primary.main, 0.05)
                                        : "background.paper",
                                    border: "1px solid",
                                    borderColor: hasBottles ? "primary.light" : "divider",
                                    transition: "all 0.2s",
                                    "&:hover": {
                                        borderColor: "primary.main",
                                        transform: "translateY(-2px)",
                                    },
                                }}
                            >
                                <CardContent>
                                    <Typography
                                        variant="subtitle2"
                                        fontWeight={700}
                                        color={hasBottles ? "primary.main" : "text.secondary"}
                                        sx={{ mb: 1 }}
                                    >
                                        {day}
                                    </Typography>

                                    {daySuggestions.length === 0 ? (
                                        <Typography variant="caption" color="text.secondary">
                                            {t("consumption.weekly.noSuggestions")}
                                        </Typography>
                                    ) : (
                                        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
                                            {daySuggestions.map((suggestion) => (
                                                <Box key={suggestion.bottleId}>
                                                    <Typography
                                                        variant="caption"
                                                        sx={{
                                                            fontWeight: 600,
                                                            display: "block",
                                                            overflow: "hidden",
                                                            textOverflow: "ellipsis",
                                                            whiteSpace: "nowrap",
                                                        }}
                                                    >
                                                        {suggestion.bottle.label}
                                                    </Typography>
                                                    <Chip
                                                        label={t(suggestion.reasons[0])}
                                                        size="small"
                                                        sx={{
                                                            height: 18,
                                                            fontSize: "0.65rem",
                                                            mt: 0.5,
                                                        }}
                                                    />
                                                </Box>
                                            ))}
                                        </Box>
                                    )}
                                </CardContent>
                            </Card>
                        </Grid>
                    );
                })}
            </Grid>
        </Paper>
    );
}
