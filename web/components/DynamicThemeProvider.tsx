"use client";

import { useAuth } from "@/lib/auth/AuthContext";
import { createTheme as createMuiTheme } from "@/lib/theme";
import { ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import { useMemo } from "react";

export function DynamicThemeProvider({ children }: { children: React.ReactNode }) {
    const { user } = useAuth();

    // Create dynamic theme based on user preferences
    const theme = useMemo(() => {
        // Determine theme mode
        let mode = user?.themeMode ?? "dark";
        if (mode === "auto") {
            // On server, we don't have window, default to dark
            if (typeof window === "undefined") {
                mode = "dark";
            } else {
                const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
                mode = isDark ? "dark" : "light";
            }
        }

        // Get accent color with fallback to default blue
        const accentColor = user?.accentColor || (mode === "dark" ? "#3B82F6" : "#2563EB");

        // Ensure accent color has # prefix
        const normalizedAccentColor = accentColor.startsWith("#") ? accentColor : `#${accentColor}`;

        // Create theme with custom accent color
        return createMuiTheme(mode as "light" | "dark", normalizedAccentColor);
    }, [user?.themeMode, user?.accentColor]);

    return (
        <ThemeProvider theme={theme}>
            <CssBaseline />
            {children}
        </ThemeProvider>
    );
}
