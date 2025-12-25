import { createTheme, ThemeProvider, CssBaseline, alpha } from '@mui/material';

/**
 * Clean UI Theme Configuration for React/MUI
 * Modern, minimalist design with enhanced readability and accessibility
 * Based on Material Design 3 principles with custom refinements
 */

// Premium color palette for wine collection app
const SEED_COLOR = '#722B3D'; // Deep wine red - thematic for collection

/**
 * Create comprehensive clean UI theme
 * Uses semantic color tokens with modern aesthetic
 */
export const createAppTheme = (mode = 'light') => {
  const isDark = mode === 'dark';

  // Define refined semantic color tokens
  const colorTokens = isDark
    ? {
        // Dark theme tokens - clean and sophisticated
        primary: '#D8A8B8',
        onPrimary: '#3E1F2B',
        primaryContainer: '#562640',
        onPrimaryContainer: '#F5D5E3',
        secondary: '#B8D8E8',
        onSecondary: '#1A3A4D',
        secondaryContainer: '#2D5169',
        onSecondaryContainer: '#D4E9FF',
        tertiary: '#A8D8C8',
        onTertiary: '#173D35',
        tertiaryContainer: '#2F564B',
        onTertiaryContainer: '#C4F5E8',
        error: '#F5BCBD',
        onError: '#431411',
        errorContainer: '#602219',
        onErrorContainer: '#F9DEDC',
        surface: '#0F0E13',
        onSurface: '#E8E7EB',
        surfaceVariant: '#4A474E',
        onSurfaceVariant: '#CCC9D3',
        surfaceContainerLowest: '#0A0A0E',
        surfaceContainerLow: '#1A1922',
        surfaceContainer: '#222028',
        surfaceContainerHigh: '#2D2C33',
        surfaceContainerHighest: '#38373E',
        outline: '#9A979F',
        outlineVariant: '#4A474E',
        scrim: '#000000',
        inverseSurface: '#E8E7EB',
        inverseOnSurface: '#312F37',
        inversePrimary: '#722B3D',
      }
    : {
        // Light theme tokens - clean and bright
        primary: '#722B3D',
        onPrimary: '#FFFFFF',
        primaryContainer: '#F5D5E3',
        onPrimaryContainer: '#2C0F1D',
        secondary: '#2D5169',
        onSecondary: '#FFFFFF',
        secondaryContainer: '#D4E9FF',
        onSecondaryContainer: '#0C2139',
        tertiary: '#2F564B',
        onTertiary: '#FFFFFF',
        tertiaryContainer: '#B1EFE5',
        onTertiaryContainer: '#081E1A',
        error: '#C5241F',
        onError: '#FFFFFF',
        errorContainer: '#F9DEDC',
        onErrorContainer: '#410E0B',
        surface: '#FFFBFE',
        onSurface: '#1C1B1F',
        surfaceVariant: '#E8E0EC',
        onSurfaceVariant: '#48454F',
        surfaceContainerLowest: '#FFFFFF',
        surfaceContainerLow: '#F7F2FA',
        surfaceContainer: '#F3EEF6',
        surfaceContainerHigh: '#ECE6F0',
        surfaceContainerHighest: '#E6DFE9',
        outline: '#79747E',
        outlineVariant: '#CAC7D0',
        scrim: '#000000',
        inverseSurface: '#313033',
        inverseOnSurface: '#F4EFF4',
        inversePrimary: '#F5D5E3',
      };

  return createTheme({
    palette: {
      mode,
      primary: {
        main: colorTokens.primary,
        light: colorTokens.primaryContainer,
        dark: colorTokens.onPrimaryContainer,
        contrastText: colorTokens.onPrimary,
      },
      secondary: {
        main: colorTokens.secondary,
        light: colorTokens.secondaryContainer,
        dark: colorTokens.onSecondaryContainer,
        contrastText: colorTokens.onSecondary,
      },
      tertiary: {
        main: colorTokens.tertiary,
        light: colorTokens.tertiaryContainer,
        dark: colorTokens.onTertiaryContainer,
        contrastText: colorTokens.onTertiary,
      },
      error: {
        main: colorTokens.error,
        light: colorTokens.errorContainer,
        dark: colorTokens.onErrorContainer,
        contrastText: colorTokens.onError,
      },
      background: {
        default: colorTokens.surface,
        paper: colorTokens.surfaceContainer,
      },
      divider: colorTokens.outlineVariant,
      action: {
        active: colorTokens.onSurface,
        disabled: alpha(colorTokens.onSurface, 0.38),
        disabledBackground: alpha(colorTokens.onSurface, 0.12),
        hover: alpha(colorTokens.primary, 0.08),
        hoverOpacity: 0.08,
        focus: alpha(colorTokens.primary, 0.12),
        focusOpacity: 0.12,
        selected: alpha(colorTokens.primary, 0.16),
        selectedOpacity: 0.16,
      },
      // Extended semantic tokens
      success: {
        main: colorTokens.tertiary,
      },
      warning: {
        main: colorTokens.tertiary,
      },
      info: {
        main: colorTokens.secondary,
      },
      // Surface tint colors for elevation
      surfaceLight: colorTokens.surfaceContainerLow,
      surfaceMedium: colorTokens.surfaceContainer,
      surfaceDark: colorTokens.surfaceContainerHigh,
      // Semantic tokens - Material Design 3
      surface: colorTokens.surface,
      onSurface: colorTokens.onSurface,
      surfaceVariant: colorTokens.surfaceVariant,
      onSurfaceVariant: colorTokens.onSurfaceVariant,
      surfaceContainer: colorTokens.surfaceContainer,
      surfaceContainerHigh: colorTokens.surfaceContainerHigh,
      surfaceContainerLow: colorTokens.surfaceContainerLow,
      outline: colorTokens.outline,
      outlineVariant: colorTokens.outlineVariant,
    },
    typography: {
      fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
      // Display Styles - Large, eye-catching text
      displayLarge: {
        fontSize: '3.5625rem', // 57px
        fontWeight: 400,
        lineHeight: 1.12,
        letterSpacing: '-0.015625rem',
      },
      displayMedium: {
        fontSize: '2.8125rem', // 45px
        fontWeight: 400,
        lineHeight: 1.16,
        letterSpacing: '0rem',
      },
      displaySmall: {
        fontSize: '2.25rem', // 36px
        fontWeight: 400,
        lineHeight: 1.22,
        letterSpacing: '0rem',
      },
      // Headline Styles - Page/Section titles
      h1: {
        fontSize: '2rem', // 32px
        fontWeight: 700,
        lineHeight: 1.25,
        letterSpacing: '0rem',
      },
      h2: {
        fontSize: '1.75rem', // 28px
        fontWeight: 700,
        lineHeight: 1.29,
        letterSpacing: '0rem',
      },
      h3: {
        fontSize: '1.5rem', // 24px
        fontWeight: 600,
        lineHeight: 1.33,
        letterSpacing: '0rem',
      },
      h4: {
        fontSize: '1.375rem', // 22px
        fontWeight: 500,
        lineHeight: 1.27,
        letterSpacing: '0rem',
      },
      h5: {
        fontSize: '1rem', // 16px
        fontWeight: 500,
        lineHeight: 1.5,
        letterSpacing: '0.009375rem',
      },
      h6: {
        fontSize: '0.875rem', // 14px
        fontWeight: 500,
        lineHeight: 1.43,
        letterSpacing: '0.00625rem',
      },
      // Body Styles - Main content
      body1: {
        fontSize: '1rem', // 16px
        fontWeight: 400,
        lineHeight: 1.5,
        letterSpacing: '0.03125rem',
      },
      body2: {
        fontSize: '0.875rem', // 14px
        fontWeight: 400,
        lineHeight: 1.43,
        letterSpacing: '0.015625rem',
      },
      // Label Styles - Buttons, chips, tables
      button: {
        fontSize: '0.875rem', // 14px
        fontWeight: 500,
        lineHeight: 1.43,
        letterSpacing: '0.00625rem',
        textTransform: 'none',
      },
      caption: {
        fontSize: '0.75rem', // 12px
        fontWeight: 500,
        lineHeight: 1.33,
        letterSpacing: '0.03125rem',
      },
    },
    shape: {
      // MD3 corner radius scale
      borderRadius: 8, // Default small
    },
    components: {
      // Button Components
      MuiButton: {
        defaultProps: {
          disableElevation: false,
        },
        styleOverrides: {
          root: {
            textTransform: 'none',
            fontWeight: 600,
            borderRadius: '12px',
            padding: '10px 24px',
            transition: 'all 0.2s ease-in-out',
            boxShadow: 'none',
          },
          // Filled Button (Primary)
          contained: {
            backgroundColor: colorTokens.primary,
            color: colorTokens.onPrimary,
            '&:hover': {
              backgroundColor: colorTokens.primaryContainer,
              color: colorTokens.onPrimaryContainer,
              boxShadow: `0 2px 8px ${alpha(colorTokens.primary, 0.2)}`,
            },
            '&:active': {
              backgroundColor: colorTokens.onPrimaryContainer,
            },
            '&:disabled': {
              backgroundColor: alpha(colorTokens.onSurface, 0.12),
              color: alpha(colorTokens.onSurface, 0.38),
            },
          },
          // Filled Tonal Button (Secondary)
          soft: {
            backgroundColor: colorTokens.secondaryContainer,
            color: colorTokens.onSecondaryContainer,
            '&:hover': {
              backgroundColor: alpha(colorTokens.secondary, 0.9),
            },
            '&:disabled': {
              backgroundColor: alpha(colorTokens.onSurface, 0.12),
              color: alpha(colorTokens.onSurface, 0.38),
            },
          },
          // Outlined Button
          outlined: {
            borderColor: colorTokens.outline,
            color: colorTokens.primary,
            '&:hover': {
              backgroundColor: alpha(colorTokens.primary, 0.08),
              borderColor: colorTokens.primary,
            },
            '&:disabled': {
              borderColor: alpha(colorTokens.onSurface, 0.12),
              color: alpha(colorTokens.onSurface, 0.38),
            },
          },
          // Text Button
          text: {
            color: colorTokens.primary,
            '&:hover': {
              backgroundColor: alpha(colorTokens.primary, 0.08),
            },
          },
        },
      },
      // Card Component
      MuiCard: {
        styleOverrides: {
          root: {
            backgroundColor: colorTokens.surfaceContainer,
            borderRadius: '16px', // Larger radius for modern look
            border: `1px solid ${alpha(colorTokens.outline, 0.12)}`,
            boxShadow: `0 1px 3px ${alpha(colorTokens.onSurface, 0.05)}`,
            transition: 'all 0.3s ease-in-out',
            '&:hover': {
              backgroundColor: colorTokens.surfaceContainerHigh,
              boxShadow: `0 4px 12px ${alpha(colorTokens.onSurface, 0.1)}`,
              transform: 'translateY(-2px)',
            },
          },
        },
      },
      // Table Component
      MuiTable: {
        styleOverrides: {
          root: {
            backgroundColor: colorTokens.surface,
          },
        },
      },
      MuiTableHead: {
        styleOverrides: {
          root: {
            backgroundColor: colorTokens.surfaceContainerHigh,
          },
        },
      },
      MuiTableCell: {
        styleOverrides: {
          head: {
            backgroundColor: colorTokens.surfaceContainerHigh,
            color: colorTokens.onSurface,
            fontWeight: 600,
            fontSize: '0.875rem',
            borderBottom: `1px solid ${alpha(colorTokens.outline, 0.12)}`,
            borderRight: 'none',
          },
          body: {
            borderBottom: `1px solid ${alpha(colorTokens.outline, 0.08)}`,
            borderRight: 'none',
            color: colorTokens.onSurface,
            '&:last-child': {
              paddingRight: '16px',
            },
          },
        },
      },
      MuiTableRow: {
        styleOverrides: {
          root: {
            '&:hover': {
              // 8% opacity primary overlay on hover
              backgroundColor: alpha(colorTokens.primary, 0.08),
            },
          },
        },
      },
      // AppBar Component
      MuiAppBar: {
        styleOverrides: {
          root: {
            backgroundColor: colorTokens.surface,
            color: colorTokens.onSurface,
            boxShadow: `0 1px 3px ${alpha(colorTokens.onSurface, 0.08)}`,
            borderBottom: `1px solid ${alpha(colorTokens.outline, 0.12)}`,
          },
          colorPrimary: {
            backgroundColor: colorTokens.surface,
            color: colorTokens.onSurface,
          },
        },
      },
      // Drawer Component
      MuiDrawer: {
        styleOverrides: {
          paper: {
            backgroundColor: colorTokens.surface,
            borderRight: `1px solid ${alpha(colorTokens.outline, 0.12)}`,
          },
        },
      },
      // Input Component
      MuiTextField: {
        defaultProps: {
          variant: 'outlined',
        },
        styleOverrides: {
          root: {
            '& .MuiOutlinedInput-root': {
              backgroundColor: colorTokens.surfaceContainerHigh,
              borderRadius: '12px',
              '& fieldset': {
                borderColor: alpha(colorTokens.outline, 0.12),
              },
              '&:hover fieldset': {
                borderColor: alpha(colorTokens.outline, 0.2),
              },
              '&.Mui-focused fieldset': {
                borderColor: colorTokens.primary,
                borderWidth: '2px',
              },
            },
          },
        },
      },
      // Pagination Component
      MuiPagination: {
        styleOverrides: {
          root: {
            '& .MuiPaginationItem-page.Mui-selected': {
              backgroundColor: colorTokens.primary,
              color: colorTokens.onPrimary,
            },
          },
        },
      },
      // Chip Component
      MuiChip: {
        styleOverrides: {
          root: {
            backgroundColor: colorTokens.secondaryContainer,
            color: colorTokens.onSecondaryContainer,
            borderRadius: '8px',
          },
          outlined: {
            borderColor: colorTokens.outline,
            backgroundColor: 'transparent',
            color: colorTokens.onSurface,
          },
        },
      },
      // Dialog Component
      MuiDialog: {
        styleOverrides: {
          paper: {
            backgroundColor: colorTokens.surfaceContainer,
            borderRadius: '28px', // Extra large corner radius for large containers
          },
        },
      },
    },
  });
};

export const lightTheme = createAppTheme('light');
export const darkTheme = createAppTheme('dark');
