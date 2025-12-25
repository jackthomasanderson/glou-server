import React, { useMemo } from 'react';
import {
  Box,
  Card,
  CardContent,
  Grid,
  Typography,
  useTheme,
  CircularProgress,
  Stack,
} from '@mui/material';
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { useWines } from '../hooks/useApi';

/**
 * KPIWidget - Key Performance Indicator card component
 */
const KPIWidget = ({
  title,
  value,
  unit = '',
  changePercentage = '',
  isPositive = true,
  icon,
  accentColor = null,
}) => {
  const theme = useTheme();
  const color = accentColor || theme.palette.primary.main;

  return (
    <Card
      sx={{
        backgroundColor: theme.palette.surfaceMedium,
        border: `1px solid ${theme.palette.divider}`,
        borderRadius: '12px',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="body2" sx={{ color: theme.palette.onSurfaceVariant }}>
            {title}
          </Typography>
          {icon && (
            <Box sx={{ fontSize: '1.5rem', opacity: 0.7 }}>
              {typeof icon === 'function' ? icon() : icon}
            </Box>
          )}
        </Box>
        <Typography variant="displaySmall" sx={{ color: theme.palette.onSurface, fontWeight: 600, mb: 1 }}>
          {value}
        </Typography>
        <Typography variant="caption" sx={{ color: theme.palette.onSurfaceVariant }}>
          {unit}
        </Typography>
        {changePercentage && (
          <Typography variant="caption" sx={{ color: isPositive ? theme.palette.tertiary.main : theme.palette.error.main, mt: 1, display: 'block' }}>
            {changePercentage}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
};

/**
 * Dashboard Screen - Analytics and statistics
 */
export const DashboardAnalyticsScreen = () => {
  const theme = useTheme();
  const { wines, loading } = useWines();

  // Calculate statistics
  const stats = useMemo(() => {
    if (!wines || wines.length === 0) {
      return {
        totalBottles: 0,
        totalValue: 0,
        averagePrice: 0,
        drinkableNow: 0,
        typeDistribution: [],
        regionDistribution: [],
        priceDistribution: [],
      };
    }

    const totalBottles = wines.reduce((sum, w) => sum + (w.quantity || 0), 0);
    const totalValue = wines.reduce((sum, w) => sum + ((w.price || 0) * (w.quantity || 0)), 0);
    const averagePrice = wines.length > 0 ? totalValue / totalBottles : 0;

    const today = new Date();
    const drinkableNow = wines.filter(w => {
      if (!w.min_apogee_date || !w.max_apogee_date) return false;
      const minDate = new Date(w.min_apogee_date);
      const maxDate = new Date(w.max_apogee_date);
      return today >= minDate && today <= maxDate;
    }).reduce((sum, w) => sum + (w.quantity || 0), 0);

    // Type distribution
    const typeDistribution = Object.entries(
      wines.reduce((acc, w) => {
        acc[w.type] = (acc[w.type] || 0) + (w.quantity || 0);
        return acc;
      }, {})
    ).map(([name, value]) => ({ name, value }));

    // Region distribution
    const regionDistribution = Object.entries(
      wines.reduce((acc, w) => {
        acc[w.region] = (acc[w.region] || 0) + (w.quantity || 0);
        return acc;
      }, {})
    )
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5); // Top 5 regions

    // Price distribution
    const priceDistribution = wines
      .reduce((acc, w) => {
        const price = w.price || 0;
        if (price < 20) acc['< 20€'] = (acc['< 20€'] || 0) + 1;
        else if (price < 50) acc['20-50€'] = (acc['20-50€'] || 0) + 1;
        else if (price < 100) acc['50-100€'] = (acc['50-100€'] || 0) + 1;
        else acc['> 100€'] = (acc['> 100€'] || 0) + 1;
        return acc;
      }, {});
    const priceDistributionData = Object.entries(priceDistribution).map(([name, value]) => ({
      name,
      value,
    }));

    return {
      totalBottles,
      totalValue,
      averagePrice,
      drinkableNow,
      typeDistribution,
      regionDistribution,
      priceDistribution: priceDistributionData,
    };
  }, [wines]);

  // Color palette
  const colors = [
    theme.palette.primary.main,
    theme.palette.secondary.main,
    theme.palette.tertiary.main,
    theme.palette.success.main,
    theme.palette.warning.main,
  ];

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', p: 5 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" sx={{ color: theme.palette.onSurface, mb: 1 }}>
          📊 Tableau de bord
        </Typography>
        <Typography variant="bodySmall" sx={{ color: theme.palette.onSurfaceVariant }}>
          Vue d'ensemble de votre cave
        </Typography>
      </Box>

      {/* KPI Row */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <KPIWidget
            title="Bouteilles"
            value={stats.totalBottles.toString()}
            unit="en cave"
            changePercentage={stats.totalBottles > 0 ? '+' : ''}
            isPositive
            icon={() => <span>🍾</span>}
            accentColor={theme.palette.primary.main}
          />
        </Grid>

        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <KPIWidget
            title="Valeur totale"
            value={`${stats.totalValue.toFixed(0)}€`}
            unit="de collection"
            changePercentage={stats.totalValue > 0 ? '+' : ''}
            isPositive
            icon={() => <span>💰</span>}
            accentColor={theme.palette.secondary.main}
          />
        </Grid>

        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <KPIWidget
            title="À boire"
            value={stats.drinkableNow.toString()}
            unit="maintenant"
            changePercentage={stats.drinkableNow > 0 ? '+' : ''}
            isPositive={stats.drinkableNow > 0}
            icon={() => <span>🥂</span>}
            accentColor={theme.palette.tertiary.main}
          />
        </Grid>

        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <KPIWidget
            title="Prix moyen"
            value={`${stats.averagePrice.toFixed(2)}€`}
            unit="par bouteille"
            changePercentage={stats.averagePrice > 0 ? '+' : ''}
            isPositive
            icon={() => <span>💎</span>}
            accentColor={theme.palette.success.main}
          />
        </Grid>
      </Grid>

      {/* Charts Grid */}
      <Grid container spacing={2}>
        {/* Type Distribution Pie Chart */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Card
            sx={{
              backgroundColor: theme.palette.surfaceMedium,
              border: `1px solid ${theme.palette.divider}`,
              borderRadius: '12px',
            }}
          >
            <CardContent>
              <Typography variant="titleMedium" sx={{ mb: 2, color: theme.palette.onSurface }}>
                Distribution par type
              </Typography>
              {stats.typeDistribution.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={stats.typeDistribution}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, value }) => `${name}: ${value}`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {stats.typeDistribution.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <Typography variant="bodySmall" sx={{ textAlign: 'center', color: theme.palette.onSurfaceVariant }}>
                  Aucune donnée
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Price Distribution Bar Chart */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Card
            sx={{
              backgroundColor: theme.palette.surfaceMedium,
              border: `1px solid ${theme.palette.divider}`,
              borderRadius: '12px',
            }}
          >
            <CardContent>
              <Typography variant="titleMedium" sx={{ mb: 2, color: theme.palette.onSurface }}>
                Distribution des prix
              </Typography>
              {stats.priceDistribution.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={stats.priceDistribution}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="value" fill={theme.palette.primary.main} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <Typography variant="bodySmall" sx={{ textAlign: 'center', color: theme.palette.onSurfaceVariant }}>
                  Aucune donnée
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Region Distribution */}
        <Grid size={{ xs: 12 }}>
          <Card
            sx={{
              backgroundColor: theme.palette.surfaceMedium,
              border: `1px solid ${theme.palette.divider}`,
              borderRadius: '12px',
            }}
          >
            <CardContent>
              <Typography variant="titleMedium" sx={{ mb: 2, color: theme.palette.onSurface }}>
                Top 5 régions
              </Typography>
              {stats.regionDistribution.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart
                    data={stats.regionDistribution}
                    layout="vertical"
                    margin={{ top: 5, right: 30, left: 200, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" />
                    <YAxis type="category" dataKey="name" />
                    <Tooltip />
                    <Bar dataKey="value" fill={theme.palette.tertiary.main} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <Typography variant="bodySmall" sx={{ textAlign: 'center', color: theme.palette.onSurfaceVariant }}>
                  Aucune donnée
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

export default DashboardAnalyticsScreen;
