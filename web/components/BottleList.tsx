"use client";

import React, { memo } from "react";
import { useTranslations } from "../lib/i18n/I18nProvider";
import { type BottleRecord } from "../lib/bottles/schema";
import { ImageZoom } from "./ImageZoom";
import { BottleToFoodPairing } from "./BottleToFoodPairing";
import {
    Card,
    CardContent,
    CardMedia,
    Typography,
    Box,
    Chip,
    IconButton,
    Skeleton,
    Grid,
    Tooltip,
    Paper,
    alpha,
    useTheme,
    Divider,
} from "@mui/material";
import {
    Edit as EditIcon,
    Delete as TrashIcon,
    Visibility as EyeIcon,
    Inventory as StockIcon,
    WineBar as WineIcon,
    SmokingRooms as CigarIcon,
    Warning as AlertIcon,
    Schedule as MaturityIcon,
} from "@mui/icons-material";

type BottleListProps = {
    bottles: BottleRecord[];
    isLoading: boolean;
    onEdit: (bottle: BottleRecord) => void;
    onDelete: (id: string) => void;
    onView?: (bottle: BottleRecord) => void;
};

function BottleListComponent({
    bottles,
    isLoading,
    onEdit,
    onDelete,
    onView,
}: BottleListProps) {
    const { t } = useTranslations();
    const theme = useTheme();

    if (isLoading) {
        return (
            <Grid container spacing={3}>
                {[1, 2, 3].map((i) => (
                    <Grid size={12} key={i}>
                        <Card sx={{ display: 'flex', height: 160 }}>
                            <Skeleton variant="rectangular" width={160} height="100%" />
                            <CardContent sx={{ flex: 1 }}>
                                <Skeleton width="40%" height={24} sx={{ mb: 1 }} />
                                <Skeleton width="80%" height={32} sx={{ mb: 2 }} />
                                <Skeleton width="60%" height={20} />
                            </CardContent>
                        </Card>
                    </Grid>
                ))}
            </Grid>
        );
    }

    if (bottles.length === 0) {
        return (
            <Paper
                variant="outlined"
                sx={{
                    py: 8,
                    px: 4,
                    textAlign: "center",
                    bgcolor: alpha(theme.palette.primary.main, 0.02),
                    borderStyle: "dashed",
                    borderRadius: 4,
                }}
            >
                <WineIcon sx={{ fontSize: 64, color: "text.disabled", mb: 2, opacity: 0.5 }} />
                <Typography variant="h6" color="text.secondary" gutterBottom>
                    {t("list.empty")}
                </Typography>
            </Paper>
        );
    }

    return (
        <Grid container spacing={3}>
            {bottles.map((bottle) => (
                <Grid size={12} key={bottle.id}>
                    <Card
                        elevation={0}
                        sx={{
                            display: "flex",
                            flexDirection: { xs: "column", sm: "row" },
                            borderRadius: 3,
                            border: "1px solid",
                            borderColor: "divider",
                            transition: "transform 0.2s, box-shadow 0.2s",
                            "&:hover": {
                                borderColor: "primary.light",
                                boxShadow: "0 4px 12px rgba(0,0,0,0.05)",
                            },
                            overflow: "hidden",
                        }}
                    >
                        {bottle.photoUrl ? (
                            <Box sx={{ width: { xs: "100%", sm: 160 }, height: { xs: 200, sm: "auto" } }}>
                                <ImageZoom src={bottle.photoUrl} alt={bottle.label} />
                            </Box>
                        ) : (
                            <Box
                                sx={{
                                    width: { xs: "100%", sm: 160 },
                                    height: { xs: 120, sm: "auto" },
                                    bgcolor: 'action.hover',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}
                            >
                                {bottle.category === 'cigar' ? <CigarIcon sx={{ fontSize: 48, opacity: 0.2 }} /> : <WineIcon sx={{ fontSize: 48, opacity: 0.2 }} />}
                            </Box>
                        )}
                        <CardContent sx={{ flex: 1, p: 3, "&:last-child": { pb: 3 } }}>
                            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 2, mb: 1 }}>
                                <Box>
                                    <Typography
                                        variant="caption"
                                        sx={{
                                            fontWeight: 700,
                                            textTransform: "uppercase",
                                            letterSpacing: "0.1em",
                                            color: "primary.main",
                                        }}
                                    >
                                        {t(`categories.${bottle.category}`)}
                                    </Typography>
                                    <Typography variant="h6" component="h3" sx={{ fontWeight: 700 }}>
                                        {bottle.label}
                                    </Typography>
                                </Box>
                                <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", justifyContent: "flex-end" }}>
                                    {bottle.quantity && bottle.quantity > 1 && (
                                        <Chip
                                            icon={<StockIcon sx={{ fontSize: "16px !important" }} />}
                                            label={bottle.quantity}
                                            size="small"
                                            color="success"
                                            sx={{ fontWeight: 700 }}
                                        />
                                    )}
                                    {bottle.isOpened && (
                                        <Chip label={t("list.opened")} size="small" variant="outlined" color="info" />
                                    )}
                                    {bottle.fillLevel && (
                                        <Chip label={t(`levels.${bottle.fillLevel}`)} size="small" variant="outlined" />
                                    )}
                                    {bottle.alertStatus && bottle.alertStatus !== "none" && (
                                        <Chip
                                            icon={<AlertIcon sx={{ fontSize: "16px !important" }} />}
                                            label={t(`alerts.${bottle.alertStatus}`)}
                                            size="small"
                                            color="error"
                                        />
                                    )}
                                </Box>
                            </Box>

                            <Grid container spacing={2} sx={{ mb: 2 }}>
                                <Grid size={{ xs: 12, md: 8 }}>
                                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, color: 'text.secondary', fontSize: '0.875rem' }}>
                                        {bottle.estimatedValue != null && (
                                            <Box component="span">€{bottle.estimatedValue.toLocaleString()} ({t("list.value")})</Box>
                                        )}
                                        {bottle.peakMaturity && (bottle.peakMaturity.from || bottle.peakMaturity.to) && (
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                <MaturityIcon sx={{ fontSize: 16 }} />
                                                {bottle.peakMaturity.from ?? "?"} – {bottle.peakMaturity.to ?? "?"}
                                            </Box>
                                        )}
                                        {bottle.location && <Box component="span">📍 {bottle.location}</Box>}
                                    </Box>
                                    {bottle.tastingNote && (
                                        <Typography variant="body2" color="text.secondary" sx={{ mt: 1, fontStyle: 'italic', display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                            "{bottle.tastingNote}"
                                        </Typography>
                                    )}
                                </Grid>
                                <Grid size={{ xs: 12, md: 4 }} sx={{ display: 'flex', justifyContent: { md: 'flex-end' }, alignItems: 'center' }}>
                                    <BottleToFoodPairing bottle={{ name: bottle.label, description: bottle.tastingNote }} />
                                </Grid>
                            </Grid>

                            <Divider sx={{ my: 1.5, opacity: 0.5 }} />

                            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <Box>
                                    {bottle.id.startsWith("temp-") && (
                                        <Typography variant="caption" sx={{ color: 'info.main', fontWeight: 600 }}>
                                            {t("list.optimistic")}
                                        </Typography>
                                    )}
                                </Box>
                                <Box sx={{ display: "flex", gap: 1 }}>
                                    {onView && (
                                        <Tooltip title={t("actions.view")}>
                                            <IconButton
                                                size="small"
                                                onClick={() => onView(bottle)}
                                                sx={{ color: 'primary.main', bgcolor: alpha(theme.palette.primary.main, 0.05) }}
                                            >
                                                <EyeIcon fontSize="small" />
                                            </IconButton>
                                        </Tooltip>
                                    )}
                                    <Tooltip title={t("actions.edit")}>
                                        <IconButton size="small" onClick={() => onEdit(bottle)}>
                                            <EditIcon fontSize="small" />
                                        </IconButton>
                                    </Tooltip>
                                    <Tooltip title={t("actions.delete")}>
                                        <IconButton size="small" color="error" onClick={() => onDelete(bottle.id)}>
                                            <TrashIcon fontSize="small" />
                                        </IconButton>
                                    </Tooltip>
                                </Box>
                            </Box>
                        </CardContent>
                    </Card>
                </Grid>
            ))}
        </Grid>
    );
}

export const BottleList = memo(BottleListComponent);
