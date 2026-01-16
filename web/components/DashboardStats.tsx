"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "../lib/i18n/I18nProvider";
import { fetchBottles } from "../lib/bottles/client";
import {
    Paper,
    Box,
    Typography,
    Grid,
    Button,
    Menu,
    MenuItem,
    useTheme,
    alpha,
    Divider,
} from "@mui/material";
import {
    Add as PlusIcon,
    KeyboardArrowDown as ArrowDownIcon,
    WineBar as WineIcon,
    SmokingRooms as CigarIcon,
    Inventory as InventoryIcon,
    Euro as EuroIcon,
    LocalFlorist as ReadyIcon,
} from "@mui/icons-material";

const queryKey = ["bottles"] as const;

export function DashboardStats() {
    const { t } = useTranslations();
    const theme = useTheme();
    const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

    const { data: bottles = [] } = useQuery({ queryKey, queryFn: () => fetchBottles() });

    const activeBottles = Array.isArray(bottles) ? bottles : [];
    const totalBottles = activeBottles.reduce((acc, b) => acc + (b.quantity || 1), 0);
    const totalValue = activeBottles.reduce((acc, b) => {
        const price = b.estimatedValue || b.purchasePrice || 0;
        return acc + (price * (b.quantity || 1));
    }, 0);
    const toDrink = activeBottles.reduce((acc, b) => {
        if (b.peakMaturity?.to && b.peakMaturity.to <= new Date().getFullYear()) {
            return acc + (b.quantity || 1);
        }
        return acc;
    }, 0);

    const handleOpenMenu = (event: React.MouseEvent<HTMLButtonElement>) => {
        setAnchorEl(event.currentTarget);
    };

    const handleCloseMenu = () => {
        setAnchorEl(null);
    };

    const StatBox = ({ label, value, icon: Icon, color }: { label: string, value: string | number, icon: any, color: string }) => (
        <Box sx={{
            p: 3,
            display: 'flex',
            flexDirection: 'column',
            gap: 1,
            minWidth: 0
        }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'text.secondary', mb: 0.5 }}>
                <Icon sx={{ fontSize: 20, color }} />
                <Typography variant="overline" sx={{ fontWeight: 700, letterSpacing: '0.05em' }}>
                    {label}
                </Typography>
            </Box>
            <Typography variant="h4" sx={{ fontWeight: 800 }}>
                {value}
            </Typography>
        </Box>
    );

    return (
        <Paper sx={{ mb: 4, borderRadius: 3, overflow: 'hidden' }}>
            <Box sx={{
                p: { xs: 2, md: 3 },
                borderBottom: '1px solid',
                borderColor: 'divider',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: { xs: 'flex-start', md: 'center' },
                flexDirection: { xs: 'column', md: 'row' },
                gap: 2
            }}>
                <Box>
                    <Typography variant="caption" sx={{ color: 'primary.main', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                        {t("app.collection")}
                    </Typography>
                    <Typography variant="h5" sx={{ fontWeight: 700, fontSize: { xs: '1.25rem', md: '1.5rem' } }}>
                        {t("dashboard.overview")}
                    </Typography>
                </Box>

                <Box sx={{ width: { xs: '100%', md: 'auto' } }}>
                    <Button
                        variant="contained"
                        disableElevation
                        onClick={handleOpenMenu}
                        startIcon={<PlusIcon />}
                        endIcon={<ArrowDownIcon />}
                        sx={{ fontWeight: 700, borderRadius: 2 }}
                        fullWidth
                    >
                        {t("actions.add")}
                    </Button>
                    <Menu
                        anchorEl={anchorEl}
                        open={Boolean(anchorEl)}
                        onClose={handleCloseMenu}
                        transformOrigin={{ horizontal: 'right', vertical: 'top' }}
                        anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
                        PaperProps={{
                            sx: {
                                mt: 1,
                                minWidth: 200,
                                boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
                                border: '1px solid',
                                borderColor: 'divider',
                            }
                        }}
                    >
                        <MenuItem
                            component={Link}
                            href="/bottles?new=true&category=wine"
                            onClick={handleCloseMenu}
                            sx={{ gap: 2, py: 1.5 }}
                        >
                            <WineIcon color="primary" />
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                {t("categories.wine")} / {t("categories.spirit")}
                            </Typography>
                        </MenuItem>
                        <MenuItem
                            component={Link}
                            href="/bottles?new=true&category=cigar"
                            onClick={handleCloseMenu}
                            sx={{ gap: 2, py: 1.5 }}
                        >
                            <CigarIcon sx={{ color: '#78350f' }} />
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                {t("categories.cigar")}
                            </Typography>
                        </MenuItem>
                    </Menu>
                </Box>
            </Box>

            <Grid container>
                <Grid size={{ xs: 12, sm: 4 }}>
                    <StatBox
                        label={t("stats.totalBottles")}
                        value={totalBottles}
                        icon={InventoryIcon}
                        color={theme.palette.primary.main}
                    />
                </Grid>
                <Grid size={{ xs: 12, sm: 4 }} sx={{ borderLeft: { sm: '1px solid' }, borderColor: 'divider' }}>
                    <StatBox
                        label={t("stats.totalValue")}
                        value={`€${totalValue.toLocaleString()}`}
                        icon={EuroIcon}
                        color="#059669"
                    />
                </Grid>
                <Grid size={{ xs: 12, sm: 4 }} sx={{ borderLeft: { sm: '1px solid' }, borderColor: 'divider' }}>
                    <StatBox
                        label={t("stats.toDrink")}
                        value={toDrink}
                        icon={ReadyIcon}
                        color="#d97706"
                    />
                </Grid>
            </Grid>
        </Paper>
    );
}
