"use client";

import { useTranslations } from "../lib/i18n/I18nProvider";
import { useConsumptionHistory } from "../lib/api/consumption";
import {
    Paper,
    Box,
    Typography,
    List,
    ListItem,
    ListItemText,
    ListItemAvatar,
    Avatar,
    Chip,
    CircularProgress,
    Alert,
    Divider,
} from "@mui/material";
import { History as HistoryIcon, LocalBar as BottleIcon } from "@mui/icons-material";

export function ConsumptionHistory() {
    const { t } = useTranslations();
    const { data, isLoading, error } = useConsumptionHistory({ limit: 20 });

    if (isLoading) {
        return (
            <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
                <CircularProgress size={32} />
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

    if (!data || data.length === 0) {
        return (
            <Paper sx={{ p: 3, borderRadius: 3, mt: 3, textAlign: "center" }}>
                <Typography variant="body2" color="text.secondary">
                    {t("consumption.history.empty")}
                </Typography>
            </Paper>
        );
    }

    return (
        <Paper sx={{ p: 3, borderRadius: 3, mt: 3 }}>
            <Box sx={{ mb: 2 }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
                    <HistoryIcon color="primary" />
                    <Typography variant="caption" sx={{ color: "primary.main", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                        {t("consumption.history.title")}
                    </Typography>
                </Box>
                <Typography variant="h6" sx={{ fontWeight: 700 }}>
                    {t("consumption.history.subtitle")}
                </Typography>
            </Box>

            <List disablePadding>
                {data.map((event, index) => {
                    const eventDate = new Date(event.eventDate);
                    const formattedDate = eventDate.toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                    });

                    return (
                        <Box key={event.id}>
                            {index > 0 && <Divider sx={{ my: 1 }} />}
                            <ListItem alignItems="flex-start" sx={{ px: 0 }}>
                                <ListItemAvatar>
                                    <Avatar
                                        src={event.bottles.photoUrl}
                                        sx={{
                                            bgcolor: "primary.main",
                                            width: 48,
                                            height: 48,
                                        }}
                                    >
                                        <BottleIcon />
                                    </Avatar>
                                </ListItemAvatar>
                                <ListItemText
                                    primary={
                                        <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
                                            <Typography variant="subtitle2" fontWeight={600}>
                                                {event.bottles.label}
                                            </Typography>
                                            <Chip
                                                label={event.bottles.category}
                                                size="small"
                                                sx={{ height: 20, fontSize: "0.7rem" }}
                                            />
                                            {event.bottles.vintageOrNone && event.bottles.vintageOrNone !== "NV" && (
                                                <Chip
                                                    label={event.bottles.vintageOrNone}
                                                    size="small"
                                                    variant="outlined"
                                                    sx={{ height: 20, fontSize: "0.7rem" }}
                                                />
                                            )}
                                        </Box>
                                    }
                                    secondary={
                                        <Box sx={{ mt: 0.5 }}>
                                            <Typography variant="caption" color="text.secondary" display="block">
                                                {t("consumption.history.consumedOn")} {formattedDate}
                                            </Typography>
                                            {event.notes && (
                                                <Typography variant="body2" sx={{ mt: 0.5, fontStyle: "italic" }}>
                                                    {event.notes}
                                                </Typography>
                                            )}
                                        </Box>
                                    }
                                />
                            </ListItem>
                        </Box>
                    );
                })}
            </List>
        </Paper>
    );
}
