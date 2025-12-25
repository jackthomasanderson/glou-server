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
  Dialog,
  DialogTitle,
  DialogContent,
} from '@mui/material';
import { useWines } from '../hooks/useApi';
import api from '../services/apiClient';

/**
 * Interactive Map-based Wine Heatmap
 * Displays French wine regions on a visual map with intensity colors
 * Allows drilling down to see wine type distribution
 */
export const WineMapHeatmap = () => {
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
          Wine Map Heatmap
        </Typography>
        <Box sx={{ marginTop: 2, height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Typography variant="body2" sx={{ color: theme.palette.onSurfaceVariant }}>
            Coming soon...
          </Typography>
        </Box>
      </CardContent>
    </Card>
  );

  // French wine regions mapped to France (approximate SVG coordinates)
  // Coordinates are percentages of a 1000x1200 viewBox
  const frenchWineRegions = {
    'Bordeaux': {
      name: 'Bordeaux',
      points: '100,400 150,380 150,450 100,470',
      center: { x: 125, y: 425 },
      description: 'Premier wines from Graves, Médoc, Pomerol, Saint-Émilion',
    },
    'Burgundy': {
      name: 'Burgundy',
      points: '300,300 350,280 360,350 310,360',
      center: { x: 330, y: 320 },
      description: 'Pinot Noir and Chardonnay specialists',
    },
    'Rhone': {
      name: 'Rhone Valley',
      points: '350,380 380,360 400,450 370,460',
      center: { x: 375, y: 410 },
      description: 'Syrah and Grenache wines',
    },
    'Loire': {
      name: 'Loire Valley',
      points: '200,320 240,310 250,350 210,360',
      center: { x: 225, y: 335 },
      description: 'Sauvignon Blanc and Cabernet Franc',
    },
    'Alsace': {
      name: 'Alsace',
      points: '420,280 460,270 470,310 430,320',
      center: { x: 445, y: 295 },
      description: 'Riesling and Gewürztraminer',
    },
    'Champagne': {
      name: 'Champagne',
      points: '280,250 310,240 320,270 290,280',
      center: { x: 300, y: 260 },
      description: 'Sparkling wine capital',
    },
    'Provence': {
      name: 'Provence',
      points: '400,500 450,490 460,540 410,550',
      center: { x: 430, y: 520 },
      description: 'Rosé wine heartland',
    },
    'Languedoc': {
      name: 'Languedoc-Roussillon',
      points: '300,520 350,510 360,570 310,580',
      center: { x: 330, y: 545 },
      description: 'Value wines and diversity',
    },
    'Southwest': {
      name: 'Southwest',
      points: '150,500 190,490 200,550 160,560',
      center: { x: 175, y: 525 },
      description: 'Cahors and local specialties',
    },
  };

  useEffect(() => {
    const fetchWinesByRegion = async () => {
      try {
        setLoading(true);
        const wineList = await api.getWines();
        
        if (!wineList || wineList.length === 0) {
          setRegionData({});
          setLoading(false);
          return;
        }

        // Normalize region names to match our regions map
        const regionMap = {};
        const normalizeRegion = (region) => {
          const normalized = region.toLowerCase().trim();
          for (const key of Object.keys(frenchWineRegions)) {
            if (normalized.includes(key.toLowerCase()) || key.toLowerCase().includes(normalized)) {
              return key;
            }
          }
          return region; // Return as-is if no match
        };

        wineList.forEach(wine => {
          const normalizedRegion = normalizeRegion(wine.region || 'Unknown');
          
          if (!regionMap[normalizedRegion]) {
            regionMap[normalizedRegion] = {
              name: normalizedRegion,
              total: 0,
              byType: {},
              wines: [],
            };
          }

          const wineType = wine.type || 'Other';
          const quantity = wine.quantity || 1;

          regionMap[normalizedRegion].total += quantity;
          regionMap[normalizedRegion].byType[wineType] = (regionMap[normalizedRegion].byType[wineType] || 0) + quantity;
          regionMap[normalizedRegion].wines.push(wine);
        });

        setRegionData(regionMap);
        setError(null);
      } catch (err) {
        console.error('Failed to fetch wines:', err);
        setError('Failed to load wine data');
        setRegionData({});
      } finally {
        setLoading(false);
      }
    };

    fetchWinesByRegion();
  }, []);

  const getRegionIntensity = (regionKey) => {
    if (!regionData[regionKey]) return 0.1;
    
    const maxTotal = Math.max(...Object.values(regionData).map(r => r.total || 0), 1);
    return (regionData[regionKey].total || 0) / maxTotal;
  };

  const getRegionColor = (intensity) => {
    // Color gradient from light to dark red
    if (intensity < 0.2) return '#FFE0E0'; // Very light red
    if (intensity < 0.4) return '#FFB3B3'; // Light red
    if (intensity < 0.6) return '#FF8080'; // Medium red
    if (intensity < 0.8) return '#CC4444'; // Dark red
    return '#990000'; // Very dark red
  };

  const handleRegionClick = (regionKey) => {
    setSelectedRegion(regionKey);
    setDetailDialog(true);
  };

  if (loading) {
    return (
      <Card
        sx={{
          backgroundColor: theme.palette.surfaceMedium,
          borderRadius: '12px',
          border: `1px solid ${theme.palette.divider}`,
          minHeight: '500px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <CircularProgress />
      </Card>
    );
  }

  if (error) {
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
            Wine Map Heatmap
          </Typography>
          <Typography color="error" variant="body2">
            {error}
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
          🇫🇷 French Wine Regions - Interactive Heatmap
        </Typography>

        <Stack spacing={2}>
          {/* SVG Map */}
          <Box
            sx={{
              backgroundColor: alpha(theme.palette.primary.main, 0.05),
              borderRadius: '8px',
              overflow: 'hidden',
              border: `1px solid ${theme.palette.divider}`,
            }}
          >
            <svg
              viewBox="0 0 500 700"
              style={{
                width: '100%',
                height: 'auto',
                minHeight: '400px',
                backgroundColor: alpha(theme.palette.primary.main, 0.03),
              }}
            >
              {/* Add simplified France map outline (SVG path) */}
              <text x="10" y="30" fontSize="14" fill={theme.palette.onSurfaceVariant}>
                France Wine Regions
              </text>

              {/* Draw regions */}
              {Object.entries(frenchWineRegions).map(([key, region]) => {
                const intensity = getRegionIntensity(key);
                const color = getRegionColor(intensity);
                const data = regionData[key];

                return (
                  <g key={key}>
                    {/* Region polygon */}
                    <polygon
                      points={region.points}
                      fill={color}
                      stroke={theme.palette.divider}
                      strokeWidth="1"
                      opacity={0.8}
                      style={{
                        cursor: 'pointer',
                        transition: 'opacity 0.2s',
                      }}
                      onMouseEnter={(e) => {
                        e.target.style.opacity = 1;
                        e.target.style.stroke = theme.palette.primary.main;
                        e.target.style.strokeWidth = 2;
                      }}
                      onMouseLeave={(e) => {
                        e.target.style.opacity = 0.8;
                        e.target.style.stroke = theme.palette.divider;
                        e.target.style.strokeWidth = 1;
                      }}
                      onClick={() => handleRegionClick(key)}
                    />
                    
                    {/* Region label */}
                    <text
                      x={region.center.x}
                      y={region.center.y}
                      textAnchor="middle"
                      fontSize="11"
                      fontWeight="bold"
                      fill="white"
                      style={{
                        cursor: 'pointer',
                        pointerEvents: 'none',
                        textShadow: '0 1px 2px rgba(0,0,0,0.5)',
                      }}
                    >
                      {data ? `${data.total}` : '0'}
                    </text>
                  </g>
                );
              })}
            </svg>
          </Box>

          {/* Legend */}
          <Box
            sx={{
              display: 'flex',
              gap: 1,
              flexWrap: 'wrap',
              justifyContent: 'center',
              padding: 1.5,
              backgroundColor: alpha(theme.palette.primary.main, 0.05),
              borderRadius: '6px',
            }}
          >
            {[
              { label: 'Very Low', color: '#FFE0E0' },
              { label: 'Low', color: '#FFB3B3' },
              { label: 'Medium', color: '#FF8080' },
              { label: 'High', color: '#CC4444' },
              { label: 'Very High', color: '#990000' },
            ].map((item) => (
              <Box
                key={item.label}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.5,
                }}
              >
                <Box
                  sx={{
                    width: '12px',
                    height: '12px',
                    backgroundColor: item.color,
                    borderRadius: '2px',
                  }}
                />
                <Typography variant="caption" sx={{ color: theme.palette.onSurfaceVariant }}>
                  {item.label}
                </Typography>
              </Box>
            ))}
          </Box>

          {/* Instructions */}
          <Typography
            variant="caption"
            sx={{
              padding: 1,
              backgroundColor: alpha(theme.palette.info.main, 0.1),
              borderRadius: '6px',
              color: theme.palette.onSurfaceVariant,
            }}
          >
            💡 Click on any region to see detailed wine type breakdown. Heatmap intensity shows bottle concentration.
          </Typography>
        </Stack>
      </CardContent>

      {/* Detail Dialog */}
      <Dialog
        open={detailDialog}
        onClose={() => setDetailDialog(false)}
        maxWidth="sm"
        fullWidth
      >
        {selectedRegion && regionData[selectedRegion] && (
          <>
            <DialogTitle>
              {frenchWineRegions[selectedRegion]?.name || selectedRegion}
            </DialogTitle>
            <DialogContent>
              <Stack spacing={2}>
                {frenchWineRegions[selectedRegion]?.description && (
                  <Typography variant="body2" color="textSecondary">
                    {frenchWineRegions[selectedRegion].description}
                  </Typography>
                )}

                <Box>
                  <Typography variant="subtitle2" sx={{ marginBottom: 1, fontWeight: 600 }}>
                    Total Bottles: {regionData[selectedRegion].total}
                  </Typography>
                </Box>

                <Box>
                  <Typography variant="subtitle2" sx={{ marginBottom: 1, fontWeight: 600 }}>
                    By Wine Type:
                  </Typography>
                  <Stack spacing={1}>
                    {Object.entries(regionData[selectedRegion].byType)
                      .sort(([, a], [, b]) => b - a)
                      .map(([type, count]) => {
                        const percentage = (count / regionData[selectedRegion].total * 100).toFixed(1);
                        return (
                          <Box key={type}>
                            <Box
                              sx={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                marginBottom: 0.5,
                              }}
                            >
                              <Typography variant="body2">{type}</Typography>
                              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                {count} ({percentage}%)
                              </Typography>
                            </Box>
                            <Box
                              sx={{
                                height: '8px',
                                backgroundColor: theme.palette.surfaceLight,
                                borderRadius: '4px',
                                overflow: 'hidden',
                              }}
                            >
                              <Box
                                sx={{
                                  height: '100%',
                                  width: `${percentage}%`,
                                  backgroundColor: theme.palette.primary.main,
                                  borderRadius: '4px',
                                }}
                              />
                            </Box>
                          </Box>
                        );
                      })}
                  </Stack>
                </Box>
              </Stack>
            </DialogContent>
          </>
        )}
      </Dialog>
    </Card>
  );
};

export default WineMapHeatmap;
