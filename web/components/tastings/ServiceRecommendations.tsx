'use client';
import React from 'react';
import { Box, Typography, Chip, Divider } from '@mui/material';
import ThermostatIcon from '@mui/icons-material/Thermostat';
import AirIcon from '@mui/icons-material/Air';
import RestaurantIcon from '@mui/icons-material/Restaurant';
import { TastingItemSummary } from '@/lib/tastings/types';
import { getRecommendations } from '@/lib/tastings/recommendations';
import { useTranslation } from 'react-i18next';

interface ServiceRecommendationsProps {
  item: TastingItemSummary;
}

export function ServiceRecommendations({ item }: ServiceRecommendationsProps) {
  const { t } = useTranslation();
  const subtype = item.color ?? item.spiritType ?? item.sparklingType ?? null;
  const reco = getRecommendations(item.category, subtype);
  if (!reco) return null;

  return (
    <Box sx={{ bgcolor: 'action.hover', borderRadius: 1, p: 1.5, mt: 1 }}>
      <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ display: 'block', mb: 1 }}>
        {t('tastings.recommendations.title')}
      </Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <ThermostatIcon fontSize="small" color="action" />
          <Typography variant="body2">
            {reco.tempMin}–{reco.tempMax}°C
          </Typography>
        </Box>
        {reco.aerationMin > 0 && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <AirIcon fontSize="small" color="action" />
            <Typography variant="body2">
              {t('tastings.recommendations.aeration', { min: reco.aerationMin, max: reco.aerationMax })}
            </Typography>
          </Box>
        )}
        {reco.foodPairings.length > 0 && (
          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
            <RestaurantIcon fontSize="small" color="action" sx={{ mt: 0.25 }} />
            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
              {reco.foodPairings.map((fp) => (
                <Chip key={fp} label={fp} size="small" variant="outlined" />
              ))}
            </Box>
          </Box>
        )}
      </Box>
    </Box>
  );
}
