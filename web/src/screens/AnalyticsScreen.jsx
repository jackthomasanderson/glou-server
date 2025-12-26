import React, { useState, useEffect } from 'react';
import {
  Box,
  Grid,
  Card,
  CardContent,
  CardHeader,
  Typography,
  CircularProgress,
  Alert,
  ToggleButton,
  ToggleButtonGroup,
  useTheme,
} from '@mui/material';
import { BarChart, Bar, LineChart, Line, ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart } from 'recharts';
import { TrendingUp, BarChart3, Map } from 'lucide-react';
import api from '../services/apiClient';

/**
 * Chart Card Component
 */
const AnalyticsCard = ({ title, icon: Icon, children }) => {
  const theme = useTheme();
  return (
    <Card sx={{ boxShadow: 'sm' }}>
      <CardHeader 
        title={title}
        avatar={<Icon size={24} />}
        titleTypographyProps={{ variant: 'subtitle1', fontWeight: 600 }}
      />
      <CardContent>
        {children}
      </CardContent>
    </Card>
  );
};

/**
 * Advanced Analytics Screen
 */
const AnalyticsScreen = () => {
  const theme = useTheme();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [timeRange, setTimeRange] = useState('all');
  const [data, setData] = useState({
    heatmapData: [],
    apogeeDistribution: [],
    regionComparison: [],
    stockEvolution: [],
  });

  useEffect(() => {
    const fetchAnalyticsData = async () => {
      setLoading(true);
      setError(null);
      try {
        const bottles = await api.getBottles();
        
        const processedData = {
          heatmapData: generateHeatmapData(bottles),
          apogeeDistribution: generateApogeeDistribution(bottles),
          regionComparison: generateRegionComparison(bottles),
          stockEvolution: generateStockEvolution(bottles),
        };

        setData(processedData);
      } catch (err) {
        console.error('Failed to load analytics:', err);
        setError('Impossible de charger les analytics');
      } finally {
        setLoading(false);
      }
    };

    fetchAnalyticsData();
  }, [timeRange]);

  const generateHeatmapData = (bottles) => {
    if (!bottles) return [];
    // Grouper par région et type
    const heatmap = {};
    bottles.forEach(b => {
      const region = b.region || 'Inconnu';
      const type = b.type || 'Autre';
      const key = `${region}|${type}`;
      heatmap[key] = (heatmap[key] || 0) + 1;
    });

    return Object.entries(heatmap)
      .map(([key, value]) => {
        const [region, type] = key.split('|');
        return { region, type, count: value };
      })
      .slice(0, 12);
  };

  const generateApogeeDistribution = (bottles) => {
    if (!bottles) return [];
    const distribution = {};
    bottles.forEach(b => {
      if (b.max_apogee_date) {
        const year = new Date(b.max_apogee_date).getFullYear();
        distribution[year] = (distribution[year] || 0) + 1;
      }
    });

    return Object.entries(distribution)
      .map(([year, count]) => ({ year: `${year}`, count, percentage: 0 }))
      .sort((a, b) => parseInt(a.year) - parseInt(b.year));
  };

  const generateRegionComparison = (bottles) => {
    if (!bottles) return [];
    const regions = {};
    bottles.forEach(b => {
      const region = b.region || 'Inconnu';
      regions[region] = (regions[region] || 0) + 1;
    });

    return Object.entries(regions)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  };

  const generateStockEvolution = (bottles) => {
    // Simuler l'évolution du stock (généralement on aurait des données historiques)
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
    const baseCount = bottles?.length || 0;
    return months.map((month, idx) => ({
      month,
      stock: baseCount - (Math.random() * 10 | 0),
      acquisitions: Math.random() * 20 | 0,
      consumed: Math.random() * 5 | 0,
    }));
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return <Alert severity="error">{error}</Alert>;
  }

  return (
    <Box sx={{ p: 3 }}>
      {/* Time Range Selector */}
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h6">Période d'analyse</Typography>
        <ToggleButtonGroup
          value={timeRange}
          exclusive
          onChange={(e, newValue) => newValue && setTimeRange(newValue)}
          size="small"
        >
          <ToggleButton value="month">1 mois</ToggleButton>
          <ToggleButton value="quarter">3 mois</ToggleButton>
          <ToggleButton value="year">1 an</ToggleButton>
          <ToggleButton value="all">Tout</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      <Grid container spacing={3}>
        {/* Region Comparison */}
        <Grid item xs={12} md={6}>
          <AnalyticsCard title="Top Régions" icon={Map}>
            <ResponsiveContainer width="100%" height={350}>
              <BarChart
                data={data.regionComparison}
                layout="vertical"
                margin={{ left: 120 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="name" type="category" width={115} />
                <Tooltip />
                <Bar dataKey="count" fill="#8B5CF6" radius={[0, 8, 8, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </AnalyticsCard>
        </Grid>

        {/* Apogee Distribution */}
        <Grid item xs={12} md={6}>
          <AnalyticsCard title="Distribution Apogée (par année)" icon={TrendingUp}>
            <ResponsiveContainer width="100%" height={350}>
              <BarChart data={data.apogeeDistribution}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="year" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" fill="#10B981" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </AnalyticsCard>
        </Grid>

        {/* Stock Evolution */}
        <Grid item xs={12}>
          <AnalyticsCard title="Évolution du Stock" icon={BarChart3}>
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={data.stockEvolution}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="stock" stroke="#8B5CF6" strokeWidth={2} />
                <Bar dataKey="acquisitions" fill="#10B981" opacity={0.7} />
                <Bar dataKey="consumed" fill="#EF4444" opacity={0.7} />
              </ComposedChart>
            </ResponsiveContainer>
          </AnalyticsCard>
        </Grid>

        {/* Type Distribution Heatmap */}
        <Grid item xs={12}>
          <AnalyticsCard title="Heatmap : Région × Type" icon={Map}>
            <ResponsiveContainer width="100%" height={300}>
              <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="region" />
                <YAxis dataKey="type" />
                <Tooltip cursor={{ strokeDasharray: '3 3' }} />
                <Scatter name="Heatmap" data={data.heatmapData} fill="#8B5CF6" />
              </ScatterChart>
            </ResponsiveContainer>
            <Typography variant="caption" sx={{ mt: 2, display: 'block', color: 'textSecondary' }}>
              Taille des points = nombre de bouteilles
            </Typography>
          </AnalyticsCard>
        </Grid>
      </Grid>
    </Box>
  );
};

export default AnalyticsScreen;
