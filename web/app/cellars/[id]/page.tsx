'use client';

import React, { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Box,
  Container,
  Typography,
  CircularProgress,
  Alert,
  Chip,
  Button,
  IconButton,
  Tooltip,
  Divider,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Grid,
  Card,
  CardContent,
  ToggleButtonGroup,
  ToggleButton,
} from '@mui/material';
import {
  ArrowBack as BackIcon,
  Edit as EditIcon,
  GridView as GridViewIcon,
  ViewList as ViewListIcon,
  Map as MapIcon,
  Warehouse as CellarIcon,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { MainLayout } from '@/components/ui/MainLayout';
import { useCellar, useCellarGrid } from '@/hooks/useCellars';
import { useInventory } from '@/hooks/useInventory';
import { CellarGridPlan } from '@/components/cellars/CellarGridPlan';
import { InventoryItem } from '@/lib/inventory/types';

type DetailView = 'grid' | 'list' | 'map';

function BottleCard({ item }: { item: InventoryItem }) {
  const { t } = useTranslation();
  return (
    <Card variant="outlined">
      <CardContent sx={{ pb: '12px !important' }}>
        <Typography variant="subtitle2" fontWeight={600} noWrap>{item.name}</Typography>
        <Typography variant="caption" color="text.secondary" noWrap display="block">{item.producer}</Typography>
        <Box display="flex" gap={0.5} mt={0.5} flexWrap="wrap">
          <Chip size="small" label={t(`categories.${item.category}`)} />
          {item.vintage && <Chip size="small" variant="outlined" label={item.vintage} />}
          {item.color && <Chip size="small" variant="outlined" label={t(`inventory.color.${item.color}`)} />}
        </Box>
      </CardContent>
    </Card>
  );
}

export default function CellarDetailPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useParams();
  const cellarId = params.id as string;

  const [view, setView] = useState<DetailView>('grid');

  const { data: cellar, isLoading: cellarLoading, isError: cellarError } = useCellar(cellarId);
  const { data: allInventory, isLoading: inventoryLoading } = useInventory();
  const { data: gridData, isLoading: gridLoading } = useCellarGrid(cellarId);

  const hasGrid = !!(cellar?.columns && cellar?.rows);

  const cellarItems = allInventory?.filter(
    (item) => item.cellarId === cellarId && !item.deletedAt
  ) ?? [];

  if (cellarLoading) {
    return (
      <MainLayout>
        <Container maxWidth="lg">
          <Box display="flex" justifyContent="center" p={8}>
            <CircularProgress />
          </Box>
        </Container>
      </MainLayout>
    );
  }

  if (cellarError || !cellar) {
    return (
      <MainLayout>
        <Container maxWidth="lg">
          <Alert severity="error" sx={{ mt: 4 }}>{t('status.error')}</Alert>
        </Container>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <Container maxWidth="lg">
        <Box sx={{ py: 4 }}>
          {/* Header */}
          <Box display="flex" alignItems="center" gap={1} mb={1}>
            <Tooltip title={t('actions.back')}>
              <IconButton size="small" onClick={() => router.push('/cellars')}>
                <BackIcon />
              </IconButton>
            </Tooltip>
            <CellarIcon color="primary" />
            <Typography variant="h5" component="h1" fontWeight={700}>
              {cellar.name}
            </Typography>
            <Chip size="small" label={t(`cellars.types.${cellar.type}`)} variant="outlined" sx={{ ml: 0.5 }} />
          </Box>

          {cellar.description && (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2, ml: 5 }}>
              {cellar.description}
            </Typography>
          )}

          {/* Stats */}
          {cellar.stats && (
            <Box display="flex" gap={1} flexWrap="wrap" mb={3} ml={5}>
              <Chip size="small" label={`${cellar.stats.totalItems} ${t('cellars.stats.items')}`} />
              {cellar.stats.alertCount > 0 && (
                <Chip size="small" color="warning" label={`${cellar.stats.alertCount} ${t('cellars.stats.alerts')}`} />
              )}
              {cellar.stats.estimatedValue != null && (
                <Chip size="small" variant="outlined" label={`~${Math.round(cellar.stats.estimatedValue)} €`} />
              )}
            </Box>
          )}

          <Divider sx={{ mb: 3 }} />

          {/* View toggle */}
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
            <ToggleButtonGroup
              value={view}
              exclusive
              onChange={(_, v) => v && setView(v)}
              size="small"
            >
              <ToggleButton value="grid" aria-label={t('view.grid')}>
                <Tooltip title={t('view.grid')}>
                  <GridViewIcon fontSize="small" />
                </Tooltip>
              </ToggleButton>
              <ToggleButton value="list" aria-label={t('view.list')}>
                <Tooltip title={t('view.list')}>
                  <ViewListIcon fontSize="small" />
                </Tooltip>
              </ToggleButton>
              {hasGrid && (
                <ToggleButton value="map" aria-label={t('view.map')}>
                  <Tooltip title={t('view.map')}>
                    <MapIcon fontSize="small" />
                  </Tooltip>
                </ToggleButton>
              )}
            </ToggleButtonGroup>
          </Box>

          {/* Grid cards view */}
          {view === 'grid' && (
            cellarItems.length === 0 ? (
              <Alert severity="info">{t('inventory.noBottles')}</Alert>
            ) : (
              <Grid container spacing={2}>
                {cellarItems.map((item) => (
                  <Grid item xs={12} sm={6} md={4} lg={3} key={item.id}>
                    <BottleCard item={item} />
                  </Grid>
                ))}
              </Grid>
            )
          )}

          {/* List view */}
          {view === 'list' && (
            cellarItems.length === 0 ? (
              <Alert severity="info">{t('inventory.noBottles')}</Alert>
            ) : (
              <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>{t('inventory.fields.name')}</TableCell>
                      <TableCell>{t('inventory.fields.producer')}</TableCell>
                      <TableCell>{t('inventory.fields.category')}</TableCell>
                      <TableCell>{t('inventory.fields.vintage')}</TableCell>
                      <TableCell>{t('cellars.grid.slot')}</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {cellarItems.map((item) => (
                      <TableRow key={item.id} hover>
                        <TableCell>
                          <Typography variant="body2" fontWeight={600}>{item.name}</Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" color="text.secondary">{item.producer}</Typography>
                        </TableCell>
                        <TableCell>
                          <Chip size="small" label={t(`categories.${item.category}`)} />
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">{item.vintage ?? '—'}</Typography>
                        </TableCell>
                        <TableCell>
                          {item.slotColumn != null && item.slotRow != null ? (
                            <Chip
                              size="small"
                              label={`C${item.slotColumn}·R${item.slotRow}`}
                              variant="outlined"
                            />
                          ) : (
                            <Typography variant="body2" color="text.secondary">—</Typography>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )
          )}

          {/* Map / grid plan view */}
          {view === 'map' && (
            gridLoading ? (
              <Box display="flex" justifyContent="center" p={4}>
                <CircularProgress />
              </Box>
            ) : gridData ? (
              <CellarGridPlan data={gridData} />
            ) : (
              <Alert severity="error">{t('status.error')}</Alert>
            )
          )}
        </Box>
      </Container>
    </MainLayout>
  );
}
