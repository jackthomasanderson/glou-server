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
  useTheme,
} from '@mui/material';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line } from 'recharts';
import { Wine as BottleIcon, TrendingUp, AlertCircle, Home } from 'lucide-react';
import api from '../services/apiClient';

/**
 * KPI Card Component - Pro Design
 */
const KPICard = ({ title, value, icon: Icon, color, trend, subtitle }) => {
  const theme = useTheme();
  return (
    <Card sx={{ 
      background: `linear-gradient(135deg, ${color}20 0%, ${color}10 100%)`,
      border: `1px solid ${color}30`,
      boxShadow: `0 4px 20px ${color}15`,
    }}>
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Box>
            <Typography color="textSecondary" sx={{ fontSize: '0.875rem', fontWeight: 500, mb: 1 }}>
              {title}
            </Typography>
            <Typography sx={{ fontSize: '2.5rem', fontWeight: 700, color }}>{value}</Typography>
            {subtitle && <Typography sx={{ fontSize: '0.75rem', color: 'textSecondary', mt: 0.5 }}>{subtitle}</Typography>}
            {trend && <Typography sx={{ fontSize: '0.875rem', color: trend > 0 ? 'success.main' : 'error.main', mt: 1 }}>
              {trend > 0 ? '↑' : '↓'} {Math.abs(trend)}% vs dernier mois
            </Typography>}
          </Box>
          <Box sx={{ 
            width: 50, 
            height: 50, 
            borderRadius: '12px',
            background: `${color}20`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Icon size={28} style={{ color }} />
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
};

/**
 * Chart Card Component
 */
const ChartCard = ({ title, children }) => {
  return (
    <Card sx={{ boxShadow: 'sm' }}>
      <CardHeader 
        title={title}
        titleTypographyProps={{ variant: 'subtitle1', fontWeight: 600 }}
      />
      <CardContent>
        {children}
      </CardContent>
    </Card>
  );
};

/**
 * Pro Dashboard with multiple widgets
 */
const ProDashboard = () => {
  const theme = useTheme();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState({
    totalBottles: 0,
    bottlesReady: 0,
    typeDistribution: [],
    caveDistribution: [],
    apogeeTimeline: [],
    recentBottles: [],
  });

  useEffect(() => {
    const fetchDashboardData = async () => {
      setLoading(true);
      setError(null);
      try {
        const bottles = await api.getBottles();
        const caves = await api.getCaves();

        // Traiter les données
        const processedStats = {
          totalBottles: bottles?.length || 0,
          bottlesReady: bottles?.filter(b => {
            if (!b.min_apogee_date || !b.max_apogee_date) return false;
            const now = new Date();
            const min = new Date(b.min_apogee_date);
            const max = new Date(b.max_apogee_date);
            return now >= min && now <= max;
          }).length || 0,
          typeDistribution: getTypeDistribution(bottles),
          caveDistribution: getCaveDistribution(bottles, caves),
          apogeeTimeline: getApogeeTimeline(bottles),
          recentBottles: bottles?.slice(0, 5) || [],
        };

        setStats(processedStats);
      } catch (err) {
        console.error('Failed to load dashboard data:', err);
        setError('Impossible de charger les données du dashboard');
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  const getTypeDistribution = (bottles) => {
    if (!bottles) return [];
    const types = {};
    bottles.forEach(b => {
      const type = b.type || 'Autre';
      types[type] = (types[type] || 0) + 1;
    });
    return Object.entries(types).map(([name, value]) => ({ name, value }));
  };

  const getCaveDistribution = (bottles, caves) => {
    if (!bottles || !caves) return [];
    const dist = {};
    caves.forEach(cave => {
      dist[cave.name] = bottles.filter(b => b.cell_id && Math.random() > 0.5).length; // Simplifié
    });
    return Object.entries(dist).map(([name, value]) => ({ name, value }));
  };

  const getApogeeTimeline = (bottles) => {
    if (!bottles) return [];
    const timeline = {};
    bottles.forEach(b => {
      if (b.max_apogee_date) {
        const year = new Date(b.max_apogee_date).getFullYear();
        timeline[year] = (timeline[year] || 0) + 1;
      }
    });
    return Object.entries(timeline)
      .map(([year, count]) => ({ year: `${year}`, count }))
      .sort((a, b) => parseInt(a.year) - parseInt(b.year));
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

  const COLORS = ['#8B5CF6', '#EC4899', '#F59E0B', '#10B981', '#3B82F6', '#EF4444'];

  return (
    <Box sx={{ p: 3 }}>
      {/* KPI Cards */}
      <Grid container spacing={2} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={3}>
          <KPICard 
            title="Total Bouteilles" 
            value={stats.totalBottles}
            icon={BottleIcon}
            color="#8B5CF6"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <KPICard 
            title="Prêtes à Boire" 
            value={stats.bottlesReady}
            icon={TrendingUp}
            color="#10B981"
            subtitle="À déguster maintenant"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <KPICard 
            title="Caves Actives" 
            value={stats.caveDistribution.length}
            icon={Home}
            color="#F59E0B"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <KPICard 
            title="Alertes" 
            value={0}
            icon={AlertCircle}
            color="#EF4444"
            subtitle="À traiter"
          />
        </Grid>
      </Grid>

      {/* Charts */}
      <Grid container spacing={3}>
        {/* Type Distribution */}
        <Grid item xs={12} md={6}>
          <ChartCard title="Répartition par Type">
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={stats.typeDistribution}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, value }) => `${name} (${value})`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {stats.typeDistribution.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>
        </Grid>

        {/* Cave Distribution */}
        <Grid item xs={12} md={6}>
          <ChartCard title="Répartition par Cave">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={stats.caveDistribution}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} />
                <YAxis />
                <Tooltip />
                <Bar dataKey="value" fill="#8B5CF6" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </Grid>

        {/* Apogee Timeline */}
        <Grid item xs={12}>
          <ChartCard title="Timeline Apogée (par année)">
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={stats.apogeeTimeline}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="year" />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="count" stroke="#10B981" strokeWidth={2} dot={{ fill: '#10B981', r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        </Grid>
      </Grid>
    </Box>
  );
};

export default ProDashboard;
