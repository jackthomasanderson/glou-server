"use client";

import { useAuth } from "@/lib/auth/AuthContext";
import { theme as defaultTheme, darkTheme } from "@/lib/theme";
import { ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import { useEffect, useState, useMemo } from "react";

export function DynamicThemeProvider({ children }: { children: React.ReactNode }) {
    const { user } = useAuth();

    // Use useMemo to avoid re-creating themes on every render if not needed
    const theme = useMemo(() => {
        let mode = user?.themeMode ?? "dark";
        if (mode === "auto") {
            // On server, we don't have window, default to dark
            if (typeof window === "undefined") return darkTheme;

            const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
            mode = isDark ? "dark" : "light";
        }
        return mode === "dark" ? darkTheme : defaultTheme;
    }, [user?.themeMode]);

    return (
        <ThemeProvider theme={theme}>
            <CssBaseline />
            {children}
        </ThemeProvider>
    );
}
