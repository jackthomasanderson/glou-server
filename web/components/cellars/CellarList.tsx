"use client";

import React, { useState, useEffect } from "react";
import { useCellars, useDeleteCellar } from "@/lib/cellars/store";
import { CellarType } from "@/types/cellars";
import { useRouter } from "next/navigation";
import { useTranslations } from "@/lib/i18n/I18nProvider";
import { ConfirmDialog } from "../ConfirmDialog";
import { ViewSwitch, ViewMode } from "../ViewSwitch";
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
  Inventory as StockIcon,
  Kitchen as KitchenIcon,
} from "@mui/icons-material";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from "@mui/material";

const STORAGE_KEY = "glou_cellars_view_mode";

export function CellarList() {
  const router = useRouter();
  const { data: cellars, isLoading, error } = useCellars();
  const deleteMutation = useDeleteCellar();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cellarToDelete, setCellarToDelete] = useState<string | null>(null);
  const { t } = useTranslations();
  const theme = useTheme();
  const [viewMode, setViewMode] = useState<ViewMode>("grid");

  useEffect(() => {
    const savedMode = localStorage.getItem(STORAGE_KEY) as ViewMode;
    if (savedMode) {
      setViewMode(savedMode);
    }
  }, []);

  const handleDelete = (e: React.MouseEvent, cellarId: string) => {
    e.stopPropagation();
    setCellarToDelete(cellarId);
    setConfirmOpen(true);
  };

  const confirmDelete = async () => {
    if (!cellarToDelete) return;

    setDeletingId(cellarToDelete);
    setConfirmOpen(false);

    try {
      await deleteMutation.mutateAsync(cellarToDelete);
    } catch (err) {
      console.error("Delete failed:", err);
      alert(`Delete failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setDeletingId(null);
      setCellarToDelete(null);
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
        <Box sx={{ width: { xs: '100%', md: 'auto' }, display: 'flex', gap: { xs: 1, sm: 2 }, alignItems: 'center', flexWrap: 'wrap', justifyContent: { xs: 'center', md: 'flex-end' } }}>
          <ViewSwitch value={viewMode} onChange={setViewMode} storageKey={STORAGE_KEY} />
          <Button
            variant="contained"
            startIcon={<PlusIcon />}
            onClick={() => router.push("/cellars/new")}
            sx={{ borderRadius: 2, fontWeight: 700, px: 3, width: { xs: '100%', sm: 'auto' } }}
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
      ) : viewMode === "grid" ? (
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
                      onClick={(e) => handleDelete(e, cellar.id)}
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
      ) : (
        <TableContainer component={Box} sx={{ mt: 2 }}>
          <Table sx={{ minWidth: 650 }} aria-label="cellars table">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700 }}>{t("cellars.form.name")}</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>{t("cellars.form.type")}</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>{t("cellars.form.placement")}</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>{t("cellars.stats.items")}</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>{t("app.name").toLowerCase() === "glou" ? "Actions" : t("actions.add")}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {cellars.map((cellar) => (
                <TableRow
                  key={cellar.id}
                  hover
                  sx={{ '&:last-child td, &:last-child th': { border: 0 }, cursor: 'pointer' }}
                  onClick={() => router.push(`/cellars/${cellar.id}`)}
                >
                  <TableCell component="th" scope="row">
                    <Typography variant="body1" sx={{ fontWeight: 600 }}>{cellar.name}</Typography>
                    {cellar.description && (
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontStyle: 'italic' }}>
                        {cellar.description}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={t(`cellars.types.${cellar.cellarType as CellarType}`)}
                      size="small"
                      color="primary"
                      variant="outlined"
                      sx={{ fontWeight: 600 }}
                    />
                  </TableCell>
                  <TableCell>
                    {cellar.placement || cellar.locationDescription ? (
                      <Box sx={{ fontSize: '0.875rem' }}>
                        {cellar.placement && <Box>📍 {cellar.placement}</Box>}
                      </Box>
                    ) : "-"}
                  </TableCell>
                  <TableCell align="right">
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
                      {((typeof cellar.bottleCount === "number" && cellar.bottleCount > 0) || (typeof cellar.cigarCount === "number" && cellar.cigarCount > 0)) ? (
                        <>
                          {typeof cellar.bottleCount === "number" && cellar.bottleCount > 0 && (
                            <Tooltip title={t("cellars.stats.bottleCount")}>
                              <Chip
                                icon={<StockIcon sx={{ fontSize: '14px !important' }} />}
                                label={cellar.bottleCount}
                                size="small"
                                variant="outlined"
                              />
                            </Tooltip>
                          )}
                          {typeof cellar.cigarCount === "number" && cellar.cigarCount > 0 && (
                            <Tooltip title={t("cellars.stats.cigarCount")}>
                              <Chip
                                icon={<KitchenIcon sx={{ fontSize: '14px !important' }} />}
                                label={cellar.cigarCount}
                                size="small"
                                variant="outlined"
                              />
                            </Tooltip>
                          )}
                        </>
                      ) : (
                        <Typography variant="body2" color="text.disabled">{t("cellars.stats.empty")}</Typography>
                      )}
                    </Box>
                  </TableCell>
                  <TableCell align="right">
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }} onClick={(e) => e.stopPropagation()}>
                      <Tooltip title={t("cellars.viewCellar")}>
                        <IconButton
                          size="small"
                          color="primary"
                          onClick={() => router.push(`/cellars/${cellar.id}`)}
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
                          onClick={(e) => handleDelete(e, cellar.id)}
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
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title={t("cellars.deleteConfirm")}
        content={t("cellars.deleteWarning")}
        onConfirm={confirmDelete}
        onCancel={() => setConfirmOpen(false)}
        confirmLabel={t("actions.delete")}
        isDanger
      />
    </Paper>
  );
}
