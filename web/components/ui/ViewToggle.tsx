'use client';
import React from 'react';
import { ToggleButtonGroup, ToggleButton, Tooltip } from '@mui/material';
import GridViewIcon from '@mui/icons-material/GridView';
import ViewListIcon from '@mui/icons-material/ViewList';
import { useTranslation } from 'react-i18next';
import { ViewMode } from '@/hooks/useViewMode';

interface ViewToggleProps {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
}

export function ViewToggle({ value, onChange }: ViewToggleProps) {
  const { t } = useTranslation();
  return (
    <ToggleButtonGroup
      value={value}
      exclusive
      onChange={(_, v) => v && onChange(v)}
      size="small"
      sx={{ height: 36 }}
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
    </ToggleButtonGroup>
  );
}
