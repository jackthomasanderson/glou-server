import React from 'react';
import { Box, Typography, useTheme } from '@mui/material';

/**
 * Simple Pie Chart for Product Type Distribution
 * Shows percentages of Red, White, Rosé, Sparkling, Beer, Spirit, Tobacco
 */
const ProductTypePieChart = ({ wines = [], tobaccos = [] }) => {
  const theme = useTheme();

  // Aggregate counts by type
  const counts = { Red: 0, White: 0, Rosé: 0, Sparkling: 0, Beer: 0, Spirit: 0, Tobacco: 0 };
  wines.forEach(w => { counts[w.type] = (counts[w.type] || 0) + (w.quantity || 0); });
  tobaccos.forEach(() => { counts.Tobacco += 1; });

  const total = Object.values(counts).reduce((sum, v) => sum + v, 0);
  if (total === 0) return <Typography variant="body2" sx={{ color: theme.palette.onSurfaceVariant }}>Aucune donnée</Typography>;

  const colors = {
    Red: '#C62828',
    White: '#FFF176',
    Rosé: '#F48FB1',
    Sparkling: '#FFD54F',
    Beer: '#FFA726',
    Spirit: '#8D6E63',
    Tobacco: '#616161',
  };

  // Calculate pie slices
  let cumulative = 0;
  const slices = Object.entries(counts)
    .filter(([_, v]) => v > 0)
    .map(([type, count]) => {
      const pct = (count / total) * 100;
      const start = cumulative;
      cumulative += pct;
      return { type, count, pct, start };
    });

  const cx = 50, cy = 50, r = 40;
  const getCoordinates = (pct) => {
    const angle = (pct / 100) * 2 * Math.PI - Math.PI / 2;
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
  };

  return (
    <Box>
      <svg viewBox="0 0 100 100" style={{ width: '100%', maxWidth: 200 }}>
        {slices.map((s, i) => {
          const p1 = getCoordinates(s.start);
          const p2 = getCoordinates(s.start + s.pct);
          const largeArc = s.pct > 50 ? 1 : 0;
          const path = `M ${cx} ${cy} L ${p1.x} ${p1.y} A ${r} ${r} 0 ${largeArc} 1 ${p2.x} ${p2.y} Z`;
          return <path key={i} d={path} fill={colors[s.type] || '#999'} />;
        })}
      </svg>
      <Box sx={{ mt: 1, display: 'flex', flexWrap: 'wrap', gap: 1 }}>
        {slices.map((s, i) => (
          <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Box sx={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: colors[s.type] }} />
            <Typography variant="caption" sx={{ color: theme.palette.onSurfaceVariant }}>
              {s.type} ({s.pct.toFixed(0)}%)
            </Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
};

export default ProductTypePieChart;
