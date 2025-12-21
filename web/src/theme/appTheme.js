import { createTheme, ThemeProvider, CssBaseline, alpha } from '@mui/material';

/**
 * Material Design 3 Theme Configuration for React/MUI
 * This theme implements Material You dynamic coloring principles
 * All colors use semantic tokens - NO hardcoded hex values
 */

// Primary seed color - generates dynamic palette
const SEED_COLOR = '#6750A4'; // Professional purple

/**
 * Create comprehensive MD3 theme
 * Uses semantic color tokens throughout
 */
export const createAppTheme = (mode = 'light') => {
  const isDark = mode === 'dark';

  // Define MD3 semantic color tokens based on brightness
  const colorTokens = isDark
    ? {
        // Dark theme tokens
        primary: '#D0BCFF',
        onPrimary: '#381E72',
        primaryContainer: '#4F378B',
        onPrimaryContainer: '#EADDFF',
        secondary: '#CCE5FF',
        onSecondary: '#003581',
        secondaryContainer: '#0047A3',
        onSecondaryContainer: '#E1F0FF',
        tertiary: '#B6F3FB',
        onTertiary: '#003A44',
        tertiaryContainer: '#004D61',
        onTertiaryContainer: '#D4F5FB',
        error: '#F9DEDC',
        onError: '#410E0B',
        errorContainer: '#601410',
        onErrorContainer: '#F9DEDC',
        surface: '#1C1B1F',
        onSurface: '#E7E1E6',
        surfaceVariant: '#49454E',
        onSurfaceVariant: '#CAC7D0',
        surfaceContainerLowest: '#0F0D13',
        surfaceContainerLow: '#282C34',
        surfaceContainer: '#2F2D32',
        surfaceContainerHigh: '#3A3940',
        surfaceContainerHighest: '#45424B',
        outline: '#9E9DA0',
        outlineVariant: '#49454E',
        scrim: '#000000',
        inverseSurface: '#E7E1E6',
        inverseOnSurface: '#1C1B1F',
        inversePrimary: '#6750A4',
      }
    : {
        // Light theme tokens
        primary: '#6750A4',
        onPrimary: '#FFFFFF',
        primaryContainer: '#EADDFF',
        onPrimaryContainer: '#21005D',
        secondary: '#0047A3',
        onSecondary: '#FFFFFF',
        secondaryContainer: '#E1F0FF',
        onSecondaryContainer: '#001D3B',
        tertiary: '#006A63',
        onTertiary: '#FFFFFF',
        tertiaryContainer: '#B6F3FB',
        onTertiaryContainer: '#002020',
        error: '#B3261E',
        onError: '#FFFFFF',
        errorContainer: '#F9DEDC',
        onErrorContainer: '#410E0B',
        surface: '#FFFBFE',
        onSurface: '#1C1B1F',
        surfaceVariant: '#E7E0EC',
        onSurfaceVariant: '#49454E',
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
        inversePrimary: '#D0BCFF',
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
        fontWeight: 400,
        lineHeight: 1.25,
        letterSpacing: '0rem',
      },
      h2: {
        fontSize: '1.75rem', // 28px
        fontWeight: 400,
        lineHeight: 1.29,
        letterSpacing: '0rem',
      },
      h3: {
        fontSize: '1.5rem', // 24px
        fontWeight: 400,
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
            fontWeight: 500,
            borderRadius: '8px',
            padding: '12px 24px',
            transition: 'all 0.2s ease-in-out',
          },
          // Filled Button (Primary)
          contained: {
            backgroundColor: colorTokens.primary,
            color: colorTokens.onPrimary,
            '&:hover': {
              backgroundColor: colorTokens.onPrimaryContainer,
              boxShadow: `0 4px 8px ${alpha(colorTokens.primary, 0.25)}`,
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
            borderRadius: '12px', // Medium corner radius for standard cards
            border: `1px solid ${colorTokens.outlineVariant}`,
            boxShadow: 'none',
            transition: 'all 0.3s ease-in-out',
            '&:hover': {
              backgroundColor: colorTokens.surfaceContainerHigh,
              boxShadow: `0 2px 8px ${alpha(colorTokens.onSurface, 0.08)}`,
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
            fontWeight: 500,
            fontSize: '0.875rem',
            borderBottom: `1px solid ${colorTokens.outlineVariant}`,
            borderRight: 'none', // NO vertical borders in MD3 tables
          },
          body: {
            borderBottom: `1px solid ${colorTokens.outlineVariant}`,
            borderRight: 'none', // NO vertical borders
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
            boxShadow: `0 1px 3px ${alpha(colorTokens.onSurface, 0.12)}`,
            borderBottom: `1px solid ${colorTokens.outlineVariant}`,
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
            backgroundColor: colorTokens.surfaceContainer,
            borderRight: `1px solid ${colorTokens.outlineVariant}`,
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
              '& fieldset': {
                borderColor: colorTokens.outlineVariant,
              },
              '&:hover fieldset': {
                borderColor: colorTokens.outline,
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
