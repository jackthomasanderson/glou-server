"use client";

import React, { useState } from "react";
import { useCellars, useDeleteCellar } from "@/lib/cellars/store";
import { CellarType } from "@/types/cellars";
import { useRouter } from "next/navigation";
import { useTranslations } from "@/lib/i18n/I18nProvider";
import {
  Box,
  Typography,
  Button,
  Paper,
  IconButton,
  Card,
  CardContent,
  Grid,
  Chip,
  alpha,
  useTheme,
  Tooltip,
  CircularProgress,
} from "@mui/material";
import {
  Visibility as EyeIcon,
  Edit as EditIcon,
  Delete as TrashIcon,
  Add as PlusIcon,
  Store as CellarIcon,
  Inventory as StockIcon,
  Kitchen as KitchenIcon,
} from "@mui/icons-material";

export function CellarList() {
  const router = useRouter();
  const { data: cellars, isLoading, error } = useCellars();
  const deleteMutation = useDeleteCellar();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const { t } = useTranslations();
  const theme = useTheme();

  const handleDelete = async (cellarId: string) => {
    const ok = window.confirm(`${t("cellars.deleteConfirm")}\n\n${t("cellars.deleteWarning")}`);
    if (ok) {
      setDeletingId(cellarId);
      try {
        await deleteMutation.mutateAsync(cellarId);
      } finally {
        setDeletingId(null);
      }
    }
  };

  if (isLoading) {
    return (
      <Paper sx={{ p: 4, borderRadius: 3, display: 'flex', justifyContent: 'center' }}>
        <CircularProgress />
      </Paper>
    );
  }

  if (error) {
    return (
      <Paper sx={{ p: 4, borderRadius: 3 }}>
        <Typography color="error">{t("cellars.loadingError")}</Typography>
      </Paper>
    );
  }

  return (
    <Paper sx={{ p: { xs: 2, md: 4 }, borderRadius: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: { xs: 'flex-start', md: 'center' }, mb: 4, flexDirection: { xs: 'column', md: 'row' }, gap: 2 }}>
        <Box>
          <Typography variant="caption" sx={{ color: 'primary.main', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            {t("app.name")}
          </Typography>
          <Typography variant="h5" sx={{ fontWeight: 700, fontSize: { xs: '1.25rem', md: '1.5rem' } }}>
            {t("cellars.title")}
          </Typography>
        </Box>
        <Box sx={{ width: { xs: '100%', md: 'auto' } }}>
          <Button
            variant="contained"
            startIcon={<PlusIcon />}
            onClick={() => router.push("/cellars/new")}
            sx={{ borderRadius: 2, fontWeight: 700, px: 3, width: { xs: '100%', md: 'auto' } }}
            disableElevation
          >
            {t("cellars.newCellar")}
          </Button>
        </Box>
      </Box>

      {!cellars || cellars.length === 0 ? (
        <Box sx={{ py: 8, textAlign: 'center', bgcolor: 'action.hover', borderRadius: 2, border: '1px dashed', borderColor: 'divider' }}>
          <KitchenIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 2, opacity: 0.5 }} />
          <Typography variant="body1" color="text.secondary">
            {t("cellars.noCellarsDescription")}
          </Typography>
        </Box>
      ) : (
        <Grid container spacing={3}>
          {cellars.map((cellar) => (
            <Grid size={{ xs: 12, sm: 6, md: 4 }} key={cellar.id}>
              <Card
                elevation={0}
                sx={{
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  borderRadius: 3,
                  border: '1px solid',
                  borderColor: 'divider',
                  transition: 'transform 0.2s, box-shadow 0.2s',
                  '&:hover': {
                    borderColor: 'primary.light',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
                  },
                }}
              >
                <CardContent sx={{ flexGrow: 1, p: 3 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                    <Box>
                      <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>
                        {cellar.name}
                      </Typography>
                      {cellar.description && (
                        <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                          {cellar.description}
                        </Typography>
                      )}
                    </Box>
                    <Chip
                      label={t(`cellars.types.${cellar.cellarType as CellarType}`)}
                      size="small"
                      color="primary"
                      variant="outlined"
                      sx={{ fontWeight: 600 }}
                    />
                  </Box>

                  <Box sx={{ mt: 2, display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                    {(() => {
                      const hasBottles = typeof cellar.bottleCount === "number" && cellar.bottleCount > 0;
                      const hasCigars = typeof cellar.cigarCount === "number" && cellar.cigarCount > 0;

                      const badges = [];
                      if (hasBottles) {
                        badges.push(
                          <Chip
                            key="bottles"
                            icon={<StockIcon sx={{ fontSize: '14px !important' }} />}
                            label={`${cellar.bottleCount}${cellar.bottleCapacity ? ` / ${cellar.bottleCapacity}` : ""}`}
                            size="small"
                            variant="outlined"
                          />
                        );
                      }
                      if (hasCigars) {
                        badges.push(
                          <Chip
                            key="cigars"
                            icon={<KitchenIcon sx={{ fontSize: '14px !important' }} />}
                            label={`${cellar.cigarCount} cigars`}
                            size="small"
                            variant="outlined"
                          />
                        );
                      }
                      if (badges.length === 0) {
                        return <Typography variant="caption" color="text.disabled">{t("cellars.stats.empty")}</Typography>;
                      }
                      return badges;
                    })()}
                  </Box>

                  {(cellar.placement || cellar.locationDescription) && (
                    <Box sx={{ mt: 2, color: 'text.secondary', fontSize: '0.75rem' }}>
                      {cellar.placement && <Box>📍 {cellar.placement}</Box>}
                      {cellar.locationDescription && <Box>🔍 {cellar.locationDescription}</Box>}
                    </Box>
                  )}
                </CardContent>

                <Box sx={{ p: 2, display: 'flex', justifyContent: 'flex-end', gap: 1, borderTop: '1px solid', borderColor: alpha(theme.palette.divider, 0.5) }}>
                  <Tooltip title={t("cellars.viewCellar")}>
                    <IconButton
                      size="small"
                      color="primary"
                      onClick={() => router.push(`/cellars/${cellar.id}`)}
                      sx={{ bgcolor: alpha(theme.palette.primary.main, 0.05) }}
                    >
                      <EyeIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title={t("actions.edit")}>
                    <IconButton size="small" onClick={() => router.push(`/cellars/${cellar.id}/edit`)}>
                      <EditIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title={t("cellars.deleteCellar")}>
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() => handleDelete(cellar.id)}
                      disabled={deletingId === cellar.id}
                    >
                      {deletingId === cellar.id ? (
                        <CircularProgress size={16} color="inherit" />
                      ) : (
                        <TrashIcon fontSize="small" />
                      )}
                    </IconButton>
                  </Tooltip>
                </Box>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}
    </Paper>
  );
}
