import React from 'react';
import { Box } from '@mui/material';

/**
 * Alpha Banner Component
 * Displays a prominent banner at the bottom of the page indicating the project is in alpha
 * Appears on all screen sizes (mobile, tablet, desktop)
 */
export const AlphaBanner = () => {
  return (
    <Box
      sx={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 999,
        backgroundColor: '#f59e0b',
        color: '#fff',
        textAlign: 'center',
        padding: '6px 16px',
        fontWeight: 600,
        letterSpacing: '0.3px',
        fontSize: '0.875rem',
        boxShadow: '0 -2px 8px rgba(0, 0, 0, 0.1)',
      }}
    >
      Alpha — Features may change between pre-release builds
    </Box>
  );
};
