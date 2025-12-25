/**
 * Clean UI Component Library
 * Reusable components following the clean design system
 * All components use semantic color tokens from the theme
 * 
 * Features:
 * - Consistent spacing and sizing
 * - Modern shadows and hover effects
 * - Responsive design
 * - Accessibility-first approach
 * - Bilingual support ready
 */

import React from 'react';
import {
  Box,
  Card,
  CardContent,
  CardHeader,
  Button,
  Typography,
  useTheme,
  alpha,
  Chip,
  Stack,
  Paper,
  IconButton,
} from '@mui/material';

/**
 * CleanCard - Base card component with subtle elevation and hover effects
 * Used for: Stat cards, content blocks, list items
 */
export const CleanCard = ({ 
  children, 
  elevation = false, 
  interactive = true,
  sx = {},
  ...props 
}) => {
  const theme = useTheme();
  
  return (
    <Card
      sx={{
        backgroundColor: theme.palette.surface,
        border: `1px solid ${alpha(theme.palette.onSurface, 0.12)}`,
        borderRadius: '16px',
        boxShadow: elevation 
          ? `0 2px 8px ${alpha(theme.palette.onSurface, 0.05)}`
          : 'none',
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        ...(interactive && {
          '&:hover': {
            boxShadow: `0 4px 16px ${alpha(theme.palette.onSurface, 0.1)}`,
            transform: 'translateY(-2px)',
            borderColor: alpha(theme.palette.primary.main, 0.2),
          },
        }),
        ...sx,
      }}
      {...props}
    >
      {children}
    </Card>
  );
};

/**
 * CleanButton - Primary action button with modern styling
 * Variants: contained (primary), outlined, soft (secondary), text
 */
export const CleanButton = ({ 
  variant = 'contained',
  children,
  sx = {},
  ...props 
}) => {
  const theme = useTheme();

  const baseStyles = {
    textTransform: 'none',
    fontWeight: 600,
    borderRadius: '12px',
    padding: '10px 24px',
    transition: 'all 0.2s ease',
    boxShadow: 'none',
  };

  const variantStyles = {
    contained: {
      ...baseStyles,
      backgroundColor: theme.palette.primary.main,
      color: theme.palette.onPrimary,
      '&:hover': {
        backgroundColor: theme.palette.primaryContainer,
        color: theme.palette.onPrimaryContainer,
        boxShadow: `0 2px 8px ${alpha(theme.palette.primary.main, 0.25)}`,
        transform: 'translateY(-2px)',
      },
    },
    outlined: {
      ...baseStyles,
      borderColor: theme.palette.onSurface,
      borderWidth: '1.5px',
      backgroundColor: 'transparent',
      color: theme.palette.primary.main,
      '&:hover': {
        backgroundColor: alpha(theme.palette.primary.main, 0.08),
        borderColor: theme.palette.primary.main,
      },
    },
    soft: {
      ...baseStyles,
      backgroundColor: alpha(theme.palette.primary.main, 0.1),
      color: theme.palette.primary.main,
      '&:hover': {
        backgroundColor: alpha(theme.palette.primary.main, 0.15),
      },
    },
    text: {
      ...baseStyles,
      backgroundColor: 'transparent',
      color: theme.palette.primary.main,
      '&:hover': {
        backgroundColor: alpha(theme.palette.primary.main, 0.08),
      },
    },
  };

  return (
    <Button
      sx={{
        ...variantStyles[variant],
        ...sx,
      }}
      {...props}
    >
      {children}
    </Button>
  );
};

/**
 * StatCard - Display a metric with icon and description
 * Used for: KPI dashboard cards
 */
export const StatCard = ({
  icon,
  label,
  value,
  description,
  color = 'primary',
  sx = {},
}) => {
  const theme = useTheme();
  const colorPalette = theme.palette[color];

  return (
    <CleanCard elevation sx={sx}>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
          <Typography variant="subtitle1" sx={{ color: theme.palette.onSurface, fontWeight: 600 }}>
            {label}
          </Typography>
          <Box
            sx={{
              backgroundColor: alpha(colorPalette.main || colorPalette, 0.15),
              borderRadius: '12px',
              padding: 1.2,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {React.cloneElement(icon, {
              sx: { color: colorPalette.main || colorPalette, fontSize: 24 },
            })}
          </Box>
        </Box>
        <Typography variant="h3" sx={{ color: theme.palette.onSurface, fontWeight: 700, marginBottom: 1 }}>
          {value}
        </Typography>
        <Typography variant="body2" sx={{ color: theme.palette.onSurfaceVariant }}>
          {description}
        </Typography>
      </CardContent>
    </CleanCard>
  );
};

/**
 * SectionTitle - Consistent section heading with optional action
 */
export const SectionTitle = ({ 
  children, 
  action = null,
  sx = {},
}) => {
  const theme = useTheme();

  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 3,
        ...sx,
      }}
    >
      <Typography 
        variant="h5" 
        sx={{ 
          color: theme.palette.onSurface, 
          fontWeight: 700,
        }}
      >
        {children}
      </Typography>
      {action && <Box>{action}</Box>}
    </Box>
  );
};

/**
 * InfoBanner - Alert/info message with icon
 * Types: info, success, warning, error
 */
export const InfoBanner = ({
  type = 'info',
  message,
  icon = null,
  action = null,
  sx = {},
}) => {
  const theme = useTheme();
  const colorMap = {
    info: theme.palette.info.main,
    success: theme.palette.success.main,
    warning: theme.palette.warning.main,
    error: theme.palette.error.main,
  };
  const color = colorMap[type];

  return (
    <Paper
      sx={{
        backgroundColor: alpha(color.main, 0.08),
        border: `1px solid ${alpha(color.main, 0.2)}`,
        borderRadius: '12px',
        padding: 2,
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        ...sx,
      }}
    >
      {icon && React.cloneElement(icon, { sx: { color: color.main, fontSize: 24 } })}
      <Box sx={{ flex: 1 }}>
        <Typography variant="body2" sx={{ color: theme.palette.onSurface }}>
          {message}
        </Typography>
      </Box>
      {action && <Box>{action}</Box>}
    </Paper>
  );
};

/**
 * DataTable - Clean table component with modern styling
 * Shows: headers, rows with alternating background, hover effects
 */
export const DataTable = ({
  headers = [],
  rows = [],
  sx = {},
}) => {
  const theme = useTheme();

  return (
    <Box
      sx={{
        overflowX: 'auto',
        borderRadius: '16px',
        border: `1px solid ${alpha(theme.palette.onSurface, 0.12)}`,
        ...sx,
      }}
    >
      <Box
        component="table"
        sx={{
          width: '100%',
          borderCollapse: 'collapse',
          backgroundColor: theme.palette.surface,
        }}
      >
        {/* Header */}
        <Box component="thead">
          <Box
            component="tr"
            sx={{
              backgroundColor: theme.palette.surfaceContainerHigh,
              borderBottom: `1px solid ${alpha(theme.palette.onSurface, 0.12)}`,
            }}
          >
            {headers.map((header, index) => (
              <Box
                component="th"
                key={index}
                sx={{
                  padding: '16px',
                  textAlign: 'left',
                  color: theme.palette.onSurface,
                  fontWeight: 600,
                  fontSize: '0.875rem',
                }}
              >
                {header}
              </Box>
            ))}
          </Box>
        </Box>

        {/* Body */}
        <Box component="tbody">
          {rows.map((row, rowIndex) => (
            <Box
              component="tr"
              key={rowIndex}
              sx={{
                borderBottom: `1px solid ${alpha(theme.palette.onSurface, 0.08)}`,
                '&:hover': {
                  backgroundColor: alpha(theme.palette.primary.main, 0.08),
                },
                transition: 'background-color 0.2s ease',
              }}
            >
              {row.map((cell, cellIndex) => (
                <Box
                  component="td"
                  key={cellIndex}
                  sx={{
                    padding: '16px',
                    color: theme.palette.onSurface,
                    fontSize: '0.875rem',
                  }}
                >
                  {cell}
                </Box>
              ))}
            </Box>
          ))}
        </Box>
      </Box>
    </Box>
  );
};

/**
 * TagGroup - Chip group with consistent styling
 */
export const TagGroup = ({
  tags = [],
  onDelete = null,
  sx = {},
}) => {
  const theme = useTheme();

  return (
    <Stack 
      direction="row" 
      spacing={1} 
      sx={{ 
        flexWrap: 'wrap',
        gap: 1,
        ...sx,
      }}
    >
      {tags.map((tag, index) => (
        <Chip
          key={index}
          label={tag}
          onDelete={onDelete ? () => onDelete(index) : undefined}
          sx={{
            backgroundColor: alpha(theme.palette.primary.main, 0.12),
            color: theme.palette.primary.main,
            fontWeight: 500,
            '& .MuiChip-deleteIcon': {
              color: 'inherit',
              '&:hover': {
                color: theme.palette.error.main,
              },
            },
          }}
        />
      ))}
    </Stack>
  );
};

/**
 * EmptyState - Show when no data is available
 */
export const EmptyState = ({
  icon,
  title,
  description,
  action = null,
  sx = {},
}) => {
  const theme = useTheme();

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 4,
        textAlign: 'center',
        ...sx,
      }}
    >
      <Box
        sx={{
          fontSize: 48,
          marginBottom: 2,
          opacity: 0.6,
        }}
      >
        {icon}
      </Box>
      <Typography variant="h6" sx={{ color: theme.palette.onSurface, fontWeight: 600, marginBottom: 1 }}>
        {title}
      </Typography>
      <Typography variant="body2" sx={{ color: theme.palette.onSurfaceVariant, marginBottom: action ? 2 : 0 }}>
        {description}
      </Typography>
      {action && <Box>{action}</Box>}
    </Box>
  );
};

/**
 * LoadingSpinner - Skeleton loading state
 */
export const SkeletonLoader = ({
  count = 3,
  height = 100,
  sx = {},
}) => {
  const theme = useTheme();

  return (
    <Stack spacing={2} sx={sx}>
      {Array.from({ length: count }).map((_, index) => (
        <Box
          key={index}
          sx={{
            height: height,
            backgroundColor: alpha(theme.palette.onSurface, 0.08),
            borderRadius: '12px',
            animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
            '@keyframes pulse': {
              '0%, 100%': {
                opacity: 1,
              },
              '50%': {
                opacity: 0.5,
              },
            },
          }}
        />
      ))}
    </Stack>
  );
};

export default {
  CleanCard,
  CleanButton,
  StatCard,
  SectionTitle,
  InfoBanner,
  DataTable,
  TagGroup,
  EmptyState,
  SkeletonLoader,
};
