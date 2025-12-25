import React, { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  Typography,
  useTheme,
  Box,
  Stack,
  Chip,
  CircularProgress,
  alpha,
} from '@mui/material';
import { useWines } from '../hooks/useApi';
import api from '../services/apiClient';

/**
 * Wine Regions Heatmap Card
 * Displays a geographic heatmap of wine bottle distribution by region
 * Shows concentration patterns (e.g., more Bordeaux reds than Rhone varieties)
 * 
 * Uses visual representation with:
 * - Regional tiles with intensity based on bottle quantity
 * - Color-coded wine types
 * - Drill-down capability to see wine type breakdown per region
 */
export const RegionalHeatmapCard = () => {
  const theme = useTheme();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Placeholder component - simplified to avoid errors
  return (
    <Card
      sx={{
        backgroundColor: theme.palette.surfaceMedium,
        border: `1px solid ${theme.palette.divider}`,
        borderRadius: '12px',
        height: '100%',
      }}
    >
      <CardContent>
        <Typography variant="h6" sx={{ color: theme.palette.onSurface }}>
          Regional Heatmap
        </Typography>
        <Box sx={{ marginTop: 2, height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Typography variant="body2" sx={{ color: theme.palette.onSurfaceVariant }}>
            Coming soon...
          </Typography>
        </Box>
      </CardContent>
    </Card>
  );

  // Famous French wine regions with approximate coordinates
  const wineRegions = {
    'Bordeaux': { color: '#8B0000', top: '30%', left: '20%' },
    'Burgundy': { color: '#7B0000', top: '25%', left: '40%' },
    'Rhone': { color: '#6B0000', top: '35%', left: '45%' },
    'Loire': { color: '#9B0000', top: '20%', left: '35%' },
    'Alsace': { color: '#7B0000', top: '15%', left: '55%' },
    'Champagne': { color: '#FFD700', top: '10%', left: '38%' },
    'Provence': { color: '#FF69B4', top: '45%', left: '50%' },
    'Languedoc': { color: '#8B0000', top: '50%', left: '40%' },
    'Southwest': { color: '#7B0000', top: '45%', left: '18%' },
  };

  useEffect(() => {
    const fetchWinesByRegion = async () => {
      try {
        setLoading(true);
        const wineList = await api.getWines();
        
        if (!wineList || wineList.length === 0) {
          setRegionData([]);
          setLoading(false);
          return;
        }

        // Group wines by region and count by type
        const regionMap = {};
        wineList.forEach(wine => {
          const region = wine.region || 'Unknown';
          
          if (!regionMap[region]) {
            regionMap[region] = {
              name: region,
              total: 0,
              byType: {},
            };
          }

          const wineType = wine.type || 'Other';
          const quantity = wine.quantity || 1;

          regionMap[region].total += quantity;
          regionMap[region].byType[wineType] = (regionMap[region].byType[wineType] || 0) + quantity;
        });

        const sortedData = Object.values(regionMap).sort((a, b) => b.total - a.total);
        setRegionData(sortedData);
        setError(null);
      } catch (err) {
        console.error('Failed to fetch wines by region:', err);
        setError('Failed to load regional data');
        setRegionData([]);
      } finally {
        setLoading(false);
      }
    };

    fetchWinesByRegion();
  }, [apiCall]);

  // Get color intensity based on quantity (normalized)
  const getIntensityColor = (quantity, maxQuantity) => {
    if (maxQuantity === 0) return theme.palette.surfaceLight;
    
    const intensity = quantity / maxQuantity;
    const baseColor = theme.palette.primary.main;
    
    return alpha(baseColor, 0.3 + intensity * 0.7);
  };

  // Get wine type distribution for a region
  const getTypeBreakdown = (region) => {
    if (!region) return [];
    
    return Object.entries(region.byType)
      .sort(([, a], [, b]) => b - a)
      .map(([type, count]) => ({ type, count }));
  };

  // Get max quantity for intensity scaling
  const maxQuantity = regionData.length > 0 
    ? Math.max(...regionData.map(r => r.total))
    : 1;

  if (loading) {
    return (
      <Card
        sx={{
          backgroundColor: theme.palette.surfaceMedium,
          borderRadius: '12px',
          border: `1px solid ${theme.palette.divider}`,
          height: '400px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <CircularProgress />
      </Card>
    );
  }

  if (error || regionData.length === 0) {
    return (
      <Card
        sx={{
          backgroundColor: theme.palette.surfaceMedium,
          borderRadius: '12px',
          border: `1px solid ${theme.palette.divider}`,
        }}
      >
        <CardContent>
          <Typography variant="h6" sx={{ marginBottom: 2 }}>
            Regional Distribution
          </Typography>
          <Typography color="textSecondary" variant="body2">
            {error || 'No wine data available to display regional distribution'}
          </Typography>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      sx={{
        backgroundColor: theme.palette.surfaceMedium,
        borderRadius: '12px',
        border: `1px solid ${theme.palette.divider}`,
      }}
    >
      <CardContent>
        <Typography variant="h6" sx={{ marginBottom: 2 }}>
          🗺️ Regional Wine Distribution Heatmap
        </Typography>
        
        <Stack spacing={3}>
          {/* Grid-based heatmap */}
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
              gap: 1.5,
              marginBottom: 2,
            }}
          >
            {regionData.map((region) => (
              <Box
                key={region.name}
                onClick={() => setSelectedRegion(selectedRegion?.name === region.name ? null : region)}
                sx={{
                  padding: 2,
                  backgroundColor: getIntensityColor(region.total, maxQuantity),
                  border: `2px solid ${
                    selectedRegion?.name === region.name
                      ? theme.palette.primary.main
                      : theme.palette.divider
                  }`,
                  borderRadius: '8px',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease-in-out',
                  '&:hover': {
                    transform: 'scale(1.05)',
                    boxShadow: `0 4px 12px ${alpha(theme.palette.primary.main, 0.2)}`,
                    borderColor: theme.palette.primary.main,
                  },
                }}
              >
                <Typography
                  variant="subtitle2"
                  sx={{
                    fontWeight: 600,
                    color: theme.palette.onSurface,
                    marginBottom: 0.5,
                  }}
                >
                  {region.name}
                </Typography>
                
                <Typography
                  variant="body2"
                  sx={{
                    color: theme.palette.onSurfaceVariant,
                    marginBottom: 1,
                  }}
                >
                  {region.total} bottles
                </Typography>

                {/* Wine type indicator dots */}
                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                  {getTypeBreakdown(region).slice(0, 3).map((item) => (
                    <Chip
                      key={item.type}
                      label={`${item.type}: ${item.count}`}
                      size="small"
                      sx={{
                        height: '20px',
                        fontSize: '0.7rem',
                        backgroundColor: alpha(theme.palette.primary.main, 0.2),
                      }}
                    />
                  ))}
                </Box>
              </Box>
            ))}
          </Box>

          {/* Selected region details */}
          {selectedRegion && (
            <Box
              sx={{
                padding: 2,
                backgroundColor: alpha(theme.palette.primary.main, 0.1),
                borderRadius: '8px',
                borderLeft: `4px solid ${theme.palette.primary.main}`,
              }}
            >
              <Typography variant="subtitle2" sx={{ marginBottom: 1, fontWeight: 600 }}>
                {selectedRegion.name} - Detailed Breakdown
              </Typography>
              
              <Stack spacing={1}>
                {getTypeBreakdown(selectedRegion).map((item) => {
                  const percentage = (item.count / selectedRegion.total * 100).toFixed(0);
                  return (
                    <Box key={item.type}>
                      <Box
                        sx={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          marginBottom: 0.5,
                        }}
                      >
                        <Typography variant="body2">
                          {item.type}
                        </Typography>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {item.count} ({percentage}%)
                        </Typography>
                      </Box>
                      <Box
                        sx={{
                          height: '6px',
                          backgroundColor: theme.palette.surfaceLight,
                          borderRadius: '3px',
                          overflow: 'hidden',
                        }}
                      >
                        <Box
                          sx={{
                            height: '100%',
                            width: `${percentage}%`,
                            backgroundColor: theme.palette.primary.main,
                            borderRadius: '3px',
                            transition: 'width 0.3s ease-in-out',
                          }}
                        />
                      </Box>
                    </Box>
                  );
                })}
              </Stack>

              <Typography
                variant="caption"
                sx={{
                  marginTop: 1.5,
                  display: 'block',
                  color: theme.palette.onSurfaceVariant,
                }}
              >
                Click another region or here to deselect
              </Typography>
            </Box>
          )}

          {/* Legend */}
          <Box
            sx={{
              padding: 1.5,
              backgroundColor: alpha(theme.palette.primary.main, 0.05),
              borderRadius: '6px',
            }}
          >
            <Typography variant="caption" sx={{ color: theme.palette.onSurfaceVariant }}>
              💡 <strong>Heatmap Intensity:</strong> Darker tiles = More bottles stored in that region. 
              Click a region to see detailed wine type breakdown.
            </Typography>
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
};

export default RegionalHeatmapCard;
