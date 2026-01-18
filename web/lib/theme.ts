import { createTheme as muiCreateTheme, alpha } from '@mui/material/styles';

const secondaryColor = '#7B1E30'; // Wine color

// Function to create a theme with custom accent color
export function createTheme(mode: 'light' | 'dark', accentColor: string) {
    const isDark = mode === 'dark';

    // Calculate hover color (darker version of accent)
    const hoverColor = adjustColorBrightness(accentColor, isDark ? -15 : -10);

    return muiCreateTheme({
        palette: {
            mode,
            primary: {
                main: accentColor,
                light: alpha(accentColor, 0.5),
                dark: hoverColor,
                contrastText: '#ffffff',
            },
            secondary: {
                main: secondaryColor,
                light: alpha(secondaryColor, 0.5),
                dark: '#5a1623',
                contrastText: '#ffffff',
            },
            background: isDark ? {
                default: '#0F172A',
                paper: '#1E293B',
            } : {
                default: '#FAFAFA',
                paper: '#FFFFFF',
            },
            text: isDark ? {
                primary: '#F1F5F9',
                secondary: '#94A3B8',
            } : {
                primary: '#1F1F1F',
                secondary: '#666666',
            },
            divider: isDark ? '#334155' : '#E8E8E8',
        },
        typography: {
            fontFamily: '"Inter", "system-ui", "-apple-system", sans-serif',
            h1: {
                fontSize: '2.5rem',
                fontWeight: 700,
                letterSpacing: '-0.02em',
            },
            h2: {
                fontSize: '2rem',
                fontWeight: 700,
                letterSpacing: '-0.01em',
            },
            h3: {
                fontSize: '1.5rem',
                fontWeight: 600,
            },
            button: {
                textTransform: 'none',
                fontWeight: 600,
            },
        },
        shape: {
            borderRadius: 8,
        },
        components: {
            MuiButton: {
                styleOverrides: {
                    root: {
                        borderRadius: 8,
                        padding: '8px 16px',
                        boxShadow: 'none',
                        '&:hover': {
                            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.05)',
                        },
                    },
                    containedPrimary: {
                        '&:hover': {
                            backgroundColor: hoverColor,
                        },
                    },
                },
            },
            MuiPaper: {
                styleOverrides: {
                    root: isDark ? {
                        backgroundImage: 'none',
                        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.2)',
                        border: '1px solid #334155',
                    } : {
                        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.08)',
                        border: '1px solid #E8E8E8',
                    },
                },
            },
            MuiTextField: {
                defaultProps: {
                    variant: 'outlined',
                    size: 'small',
                },
            },
        },
    });
}

// Helper function to adjust color brightness
function adjustColorBrightness(hex: string, percent: number): string {
    const num = parseInt(hex.replace("#", ""), 16);
    const amt = Math.round(2.55 * percent);
    const R = Math.max(0, Math.min(255, (num >> 16) + amt));
    const G = Math.max(0, Math.min(255, (num >> 8 & 0x00FF) + amt));
    const B = Math.max(0, Math.min(255, (num & 0x0000FF) + amt));
    return "#" + (0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1).toUpperCase();
}

// Default themes for backward compatibility
const primaryColor = '#2563EB';

export const theme = createTheme('light', primaryColor);
export const darkTheme = createTheme('dark', '#3B82F6');
