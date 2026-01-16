"use client";

import Sidebar from "./Sidebar";
import BottomNav from "./BottomNav";
import { Box } from "@mui/material";

export function DashboardLayoutClient({ children }: { children: React.ReactNode }) {
    return (
        <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
            <Sidebar />
            <Box
                component="main"
                sx={{
                    flexGrow: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    minWidth: 0, // Prevent flex items from overflowing
                    pb: { xs: 8, md: 0 } // Space for bottom nav on mobile
                }}
            >
                <Box className="app-content" sx={{ p: { xs: 2, md: 4 } }}>
                    {children}
                </Box>
            </Box>
            <BottomNav />
        </Box>
    );
}
