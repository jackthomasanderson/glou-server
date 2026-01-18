"use client";

import { useTranslations } from "../lib/i18n/I18nProvider";
import {
    useNotifications,
    useMarkNotificationRead,
    useDismissNotification,
    type Notification,
} from "../lib/api/alerts";
import {
    Paper,
    Box,
    Typography,
    List,
    ListItem,
    ListItemText,
    ListItemAvatar,
    Avatar,
    Chip,
    CircularProgress,
    Alert,
    IconButton,
    Stack,
    Tooltip,
    Button,
    Tabs,
    Tab,
    alpha,
    useTheme,
} from "@mui/material";
import {
    Notifications as NotificationIcon,
    CheckCircle as ReadIcon,
    Close as CloseIcon,
    Warning as WarningIcon,
    LocalBar as BottleIcon,
} from "@mui/icons-material";
import { useState } from "react";

export function AlertCenter() {
    const { t } = useTranslations();
    const theme = useTheme();
    const [filter, setFilter] = useState<"all" | "unread" | "peak_maturity">("all");

    const { data: notifications, isLoading, error } = useNotifications({
        read: filter === "unread" ? false : undefined,
        type: filter === "peak_maturity" ? "peak_maturity" : undefined,
    });

    const markRead = useMarkNotificationRead();
    const dismiss = useDismissNotification();

    const handleMarkRead = async (notificationId: string) => {
        try {
            await markRead.mutateAsync(notificationId);
        } catch (error) {
            console.error("Failed to mark notification as read", error);
        }
    };

    const handleDismiss = async (notificationId: string) => {
        try {
            await dismiss.mutateAsync(notificationId);
        } catch (error) {
            console.error("Failed to dismiss notification", error);
        }
    };

    const getNotificationIcon = (type: string) => {
        switch (type) {
            case "peak_maturity":
                return <WarningIcon />;
            default:
                return <NotificationIcon />;
        }
    };

    if (isLoading) {
        return (
            <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
                <CircularProgress />
            </Box>
        );
    }

    if (error) {
        return (
            <Alert severity="error" sx={{ mt: 3 }}>
                {t("error")}
            </Alert>
        );
    }

    const hasNotifications = notifications && notifications.length > 0;

    return (
        <Paper sx={{ borderRadius: 3, mt: 3 }}>
            <Box sx={{ p: 3, borderBottom: 1, borderColor: "divider" }}>
                <Typography variant="h5" sx={{ fontWeight: 700, mb: 2 }}>
                    {t("alerts.center.title")}
                </Typography>

                <Tabs
                    value={filter}
                    onChange={(_, value) => setFilter(value)}
                    sx={{ minHeight: 40 }}
                >
                    <Tab label={t("alerts.center.filters.all")} value="all" sx={{ minHeight: 40 }} />
                    <Tab label={t("alerts.center.filters.unread")} value="unread" sx={{ minHeight: 40 }} />
                    <Tab
                        label={t("alerts.center.filters.peakMaturity")}
                        value="peak_maturity"
                        sx={{ minHeight: 40 }}
                    />
                </Tabs>
            </Box>

            {!hasNotifications ? (
                <Box sx={{ p: 6, textAlign: "center" }}>
                    <NotificationIcon
                        sx={{ fontSize: 64, color: "text.disabled", mb: 2 }}
                    />
                    <Typography variant="body1" color="text.secondary">
                        {t("alerts.center.empty")}
                    </Typography>
                </Box>
            ) : (
                <List disablePadding>
                    {notifications.map((notification) => (
                        <ListItem
                            key={notification.id}
                            sx={{
                                px: 3,
                                py: 2,
                                borderBottom: 1,
                                borderColor: "divider",
                                bgcolor: notification.read
                                    ? "transparent"
                                    : alpha(theme.palette.primary.main, 0.05),
                                "&:last-child": {
                                    borderBottom: 0,
                                },
                                transition: "background-color 0.2s",
                                "&:hover": {
                                    bgcolor: alpha(theme.palette.primary.main, 0.08),
                                },
                            }}
                            secondaryAction={
                                <Stack direction="row" spacing={1}>
                                    {!notification.read && (
                                        <Tooltip title={t("alerts.center.markRead")}>
                                            <IconButton
                                                size="small"
                                                onClick={() => handleMarkRead(notification.id)}
                                                disabled={markRead.isPending}
                                            >
                                                <ReadIcon fontSize="small" />
                                            </IconButton>
                                        </Tooltip>
                                    )}
                                    <Tooltip title={t("alerts.center.dismiss")}>
                                        <IconButton
                                            size="small"
                                            onClick={() => handleDismiss(notification.id)}
                                            disabled={dismiss.isPending}
                                        >
                                            <CloseIcon fontSize="small" />
                                        </IconButton>
                                    </Tooltip>
                                </Stack>
                            }
                        >
                            <ListItemAvatar>
                                <Avatar
                                    sx={{
                                        bgcolor: notification.read
                                            ? "grey.400"
                                            : notification.type === "peak_maturity"
                                                ? "warning.main"
                                                : "primary.main",
                                    }}
                                >
                                    {getNotificationIcon(notification.type)}
                                </Avatar>
                            </ListItemAvatar>
                            <ListItemText
                                primary={
                                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                                        <Typography variant="subtitle1" fontWeight={notification.read ? 400 : 700}>
                                            {notification.title}
                                        </Typography>
                                        {!notification.read && (
                                            <Chip
                                                label="Nouveau"
                                                size="small"
                                                color="primary"
                                                sx={{ height: 20, fontSize: "0.7rem" }}
                                            />
                                        )}
                                    </Box>
                                }
                                secondary={
                                    <Box component="div">
                                        {notification.message && (
                                            <Typography component="div" variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                                                {notification.message}
                                            </Typography>
                                        )}
                                        <Typography component="div" variant="caption" color="text.disabled" sx={{ mt: 0.5, display: "block" }}>
                                            {new Date(notification.createdAt).toLocaleString()}
                                        </Typography>
                                    </Box>
                                }
                                secondaryTypographyProps={{ component: 'div' }}
                            />
                        </ListItem>
                    ))}
                </List>
            )}
        </Paper>
    );
}
