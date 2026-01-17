"use client";

import { Avatar, Badge, IconButton, Popover, Box, Typography, List, ListItem, ListItemText, Button, Divider } from "@mui/material";
import { Notifications as NotificationsIcon } from "@mui/icons-material";
import { useUnreadCount } from "../lib/api/alerts";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../lib/auth/AuthContext";

export function AlertBadge() {
    const { isAuthenticated, isLoading } = useAuth();
    const { data: unreadCount } = useUnreadCount({ enabled: isAuthenticated && !isLoading });
    const router = useRouter();
    const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

    // Don't render anything if not authenticated or still loading
    if (!isAuthenticated || isLoading) {
        return null;
    }

    const handleClick = (event: React.MouseEvent<HTMLElement>) => {
        setAnchorEl(event.currentTarget);
    };

    const handleClose = () => {
        setAnchorEl(null);
    };

    const handleViewAll = () => {
        handleClose();
        router.push("/alerts");
    };

    const open = Boolean(anchorEl);

    return (
        <>
            <IconButton color="inherit" onClick={handleClick}>
                <Badge badgeContent={unreadCount || 0} color="error">
                    <NotificationsIcon />
                </Badge>
            </IconButton>

            <Popover
                open={open}
                anchorEl={anchorEl}
                onClose={handleClose}
                anchorOrigin={{
                    vertical: "bottom",
                    horizontal: "right",
                }}
                transformOrigin={{
                    vertical: "top",
                    horizontal: "right",
                }}
            >
                <Box sx={{ p: 2, minWidth: 300 }}>
                    <Typography variant="h6" sx={{ mb: 1 }}>
                        Notifications
                    </Typography>
                    {(unreadCount || 0) > 0 ? (
                        <>
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                                Vous avez {unreadCount} notification(s) non lue(s)
                            </Typography>
                            <Button fullWidth variant="contained" onClick={handleViewAll}>
                                Voir toutes les alertes
                            </Button>
                        </>
                    ) : (
                        <Typography variant="body2" color="text.secondary">
                            Aucune nouvelle notification
                        </Typography>
                    )}
                </Box>
            </Popover>
        </>
    );
}
