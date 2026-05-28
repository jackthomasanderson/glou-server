// Theme tokens — kept as JS constants so app code that imports
// colour values stays working without MUI.
export const theme = {
  palette: {
    primary: { main: '#2563EB', light: '#3B82F6', dark: '#1D4ED8', contrastText: '#FFFFFF' },
    secondary: { main: '#7B1E30', light: '#9B3E50', dark: '#5B0E20', contrastText: '#FFFFFF' },
    background: { default: '#FAFAFA', paper: '#FFFFFF' },
    text: { primary: '#1F1F1F', secondary: '#666666' },
    error: { main: '#EF4444' },
    success: { main: '#10B981' },
    warning: { main: '#F59E0B' },
  },
};

export const darkTheme = {
  palette: {
    primary: { main: '#3B82F6', contrastText: '#FFFFFF' },
    secondary: { main: '#7B1E30', contrastText: '#FFFFFF' },
    background: { default: '#0F172A', paper: '#1E293B' },
    text: { primary: '#F1F5F9', secondary: '#94A3B8' },
    error: { main: '#EF4444' },
    success: { main: '#10B981' },
  },
};
