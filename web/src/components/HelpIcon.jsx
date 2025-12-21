import React from 'react';
import { Tooltip, Box, Typography } from '@mui/material';
import { Info as InfoIcon } from '@mui/icons-material';

/**
 * HelpIcon Component
 * Displays a small (i) icon with a tooltip on hover
 * 
 * @param {string} title - The tooltip title
 * @param {string} description - The tooltip description text
 * @param {object} sx - Optional MUI sx prop for custom styling
 */
export const HelpIcon = ({ title, description, sx = {} }) => {
  const tooltipContent = (
    <Box>
      {title && (
        <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5 }}>
          {title}
        </Typography>
      )}
      <Typography variant="body2" sx={{ opacity: 0.9 }}>
        {description}
      </Typography>
    </Box>
  );

  return (
    <Tooltip title={tooltipContent} arrow placement="right" enterDelay={200}>
      <InfoIcon
        sx={{
          fontSize: '1rem',
          opacity: 0.6,
          cursor: 'help',
          verticalAlign: 'middle',
          ml: 0.5,
          transition: 'opacity 0.2s ease',
          '&:hover': {
            opacity: 1,
          },
          ...sx,
        }}
      />
    </Tooltip>
  );
};

/**
 * HelpLabel Component
 * Displays a label with an inline help icon
 * 
 * @param {string} label - The label text
 * @param {string} helpTitle - The tooltip title
 * @param {string} helpDescription - The tooltip description
 * @param {object} sx - Optional MUI sx prop
 */
export const HelpLabel = ({ label, helpTitle, helpDescription, sx = {} }) => {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, ...sx }}>
      <Typography variant="subtitle2" sx={{ fontWeight: 500 }}>
        {label}
      </Typography>
      <HelpIcon title={helpTitle} description={helpDescription} />
    </Box>
  );
};
