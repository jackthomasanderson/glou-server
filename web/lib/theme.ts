import { createTheme, alpha } from '@mui/material/styles';

const primaryColor = '#2563EB';
const secondaryColor = '#7B1E30'; // Wine color

export const theme = createTheme({
    palette: {
        primary: {
            main: primaryColor,
            light: alpha(primaryColor, 0.5),
            dark: '#1D4ED8',
            contrastText: '#ffffff',
        },
        secondary: {
            main: secondaryColor,
            light: alpha(secondaryColor, 0.5),
            dark: '#5a1623',
            contrastText: '#ffffff',
        },
        background: {
            default: '#FAFAFA',
            paper: '#FFFFFF',
        },
        text: {
            primary: '#1F1F1F',
            secondary: '#666666',
        },
        divider: '#E8E8E8',
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
                        backgroundColor: '#1D4ED8',
                    },
                },
            },
        },
        MuiPaper: {
            styleOverrides: {
                root: {
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

export const darkTheme = createTheme({
    palette: {
        mode: 'dark',
        primary: {
            main: '#3B82F6',
            light: alpha('#3B82F6', 0.5),
            dark: '#2563EB',
            contrastText: '#ffffff',
        },
        secondary: {
            main: secondaryColor,
            light: alpha(secondaryColor, 0.5),
            dark: '#5a1623',
            contrastText: '#ffffff',
        },
        background: {
            default: '#0F172A',
            paper: '#1E293B',
        },
        text: {
            primary: '#F1F5F9',
            secondary: '#94A3B8',
        },
        divider: '#334155',
    },
    typography: {
        fontFamily: '"Inter", "system-ui", "-apple-system", sans-serif',
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
                },
            },
        },
        MuiPaper: {
            styleOverrides: {
                root: {
                    backgroundImage: 'none',
                    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.2)',
                    border: '1px solid #334155',
                },
            },
        },
    },
});
