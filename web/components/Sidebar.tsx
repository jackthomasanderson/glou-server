"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "../lib/i18n/I18nProvider";
import { fetchAppSettings } from "../lib/profile/client";
import { bottlesClient } from "../lib/bottles/client";
import { useCellars } from "../lib/cellars/store";
import {
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Box,
  Typography,
  IconButton,
  Divider,
  Badge,
  Tooltip,
  useTheme,
  alpha,
} from "@mui/material";
import {
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
  Dashboard as DashboardIcon,
  WineBar as BottlesIcon,
  Kitchen as CellarsIcon,
  SmokingRooms as CigarsIcon,
  CalendarMonth as ConsumptionIcon,
} from "@mui/icons-material";

const DRAWER_WIDTH = 260;
const COLLAPSED_DRAWER_WIDTH = 72;

export default function Sidebar() {
  const { t } = useTranslations();
  const theme = useTheme();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  const { data: settings } = useQuery({
    queryKey: ["app-settings"],
    queryFn: fetchAppSettings,
    staleTime: 60_000,
  });

  const { data: bottles = [] } = useQuery({
    queryKey: ["bottles"],
    queryFn: () => bottlesClient.list(),
    staleTime: 30_000,
  });

  const { data: cigars = [] } = useQuery({
    queryKey: ["cigars"],
    queryFn: async () => {
      const all = await bottlesClient.list();
      return all.filter(item => item.category === "cigar");
    },
    staleTime: 30_000,
  });

  const { data: cellars = [] } = useCellars();

  const bottlesCount = Array.isArray(bottles) ? bottles.length : 0;
  const cigarsCount = Array.isArray(cigars) ? cigars.length : 0;

  const hasWineCellar = cellars.some(c => ["aging", "service", "multizone", "combined", "hybrid", "natural", "other"].includes(c.cellarType));
  const hasCigarCellar = cellars.some(c => ["cigar", "combined", "hybrid", "other"].includes(c.cellarType));

  useEffect(() => {
    try {
      const v = localStorage.getItem("glou-sidebar-collapsed");
      if (v === "1") setCollapsed(true);
    } catch { }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("glou-sidebar-collapsed", collapsed ? "1" : "0");
    } catch { }
  }, [collapsed]);

  const items = [
    { href: "/dashboard", label: t("nav.dashboard"), Icon: DashboardIcon, show: true, count: 0 },
    { href: "/bottles", label: t("nav.bottles"), Icon: BottlesIcon, show: bottlesCount > 0 || hasWineCellar, count: bottlesCount },
    { href: "/consumption", label: t("consumption.title"), Icon: ConsumptionIcon, show: bottlesCount > 0, count: 0 },
    { href: "/cellars", label: t("nav.cellars"), Icon: CellarsIcon, show: true, count: cellars.length },
    { href: "/cigars", label: t("nav.cigars"), Icon: CigarsIcon, show: cigarsCount > 0 || hasCigarCellar, count: cigarsCount },
  ];

  return (
    <Drawer
      variant="permanent"
      sx={{
        display: { xs: 'none', md: 'block' },
        width: collapsed ? COLLAPSED_DRAWER_WIDTH : DRAWER_WIDTH,
        flexShrink: 0,
        "& .MuiDrawer-paper": {
          width: collapsed ? COLLAPSED_DRAWER_WIDTH : DRAWER_WIDTH,
          boxSizing: "border-box",
          backgroundColor: "background.paper",
          borderRight: "1px solid",
          borderColor: "divider",
          transition: theme.transitions.create("width", {
            easing: theme.transitions.easing.sharp,
            duration: theme.transitions.duration.enteringScreen,
          }),
          overflowX: "hidden",
        },
      }}
    >
      <Box sx={{ p: 2, display: "flex", alignItems: "center", justifyContent: "space-between", minHeight: 64 }}>
        {!collapsed && (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, overflow: "hidden" }}>
            {settings?.logoUrl ? (
              <Box component="img" src={settings.logoUrl} alt="Logo" sx={{ width: 32, height: 32, borderRadius: 1 }} />
            ) : (
              <Box sx={{
                width: 32,
                height: 32,
                bgcolor: "secondary.main",
                color: "white",
                borderRadius: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 800,
                fontSize: 16
              }}>
                {settings?.appName?.[0] || "G"}
              </Box>
            )}
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1, whiteSpace: "nowrap" }}>
                {settings?.appName || "Glou"}
              </Typography>
              {settings?.appTagline && (
                <Typography variant="caption" sx={{ color: "text.secondary", display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {settings.appTagline}
                </Typography>
              )}
            </Box>
          </Box>
        )}
        {collapsed && (
          <Box sx={{ mx: "auto" }}>
            {settings?.logoUrl ? (
              <Box component="img" src={settings.logoUrl} alt="Logo" sx={{ width: 32, height: 32, borderRadius: 1 }} />
            ) : (
              <Typography variant="h6" sx={{ color: "secondary.main", fontWeight: 900 }}>{settings?.appName?.[0] || "G"}</Typography>
            )}
          </Box>
        )}
        <IconButton onClick={() => setCollapsed(!collapsed)} size="small" sx={{ ml: collapsed ? 0 : 1 }}>
          {collapsed ? <ChevronRightIcon /> : <ChevronLeftIcon />}
        </IconButton>
      </Box>

      <Divider />

      <List sx={{ px: 1, py: 2 }}>
        {items
          .filter((it) => it.show)
          .map((item) => {
            const active = pathname === item.href || (item.href !== "/" && pathname?.startsWith(item.href));
            return (
              <ListItem key={item.href} disablePadding sx={{ display: "block", mb: 0.5 }}>
                <Tooltip title={collapsed ? item.label : ""} placement="right">
                  <ListItemButton
                    component={Link}
                    href={item.href}
                    sx={{
                      minHeight: 48,
                      justifyContent: collapsed ? "center" : "initial",
                      px: 2.5,
                      borderRadius: 2,
                      backgroundColor: active ? alpha(theme.palette.primary.main, 0.08) : "transparent",
                      color: active ? "primary.main" : "text.secondary",
                      "&:hover": {
                        backgroundColor: active ? alpha(theme.palette.primary.main, 0.12) : alpha(theme.palette.action.hover, 0.04),
                        color: active ? "primary.main" : "text.primary",
                      },
                    }}
                  >
                    <ListItemIcon
                      sx={{
                        minWidth: 0,
                        mr: collapsed ? 0 : 2,
                        justifyContent: "center",
                        color: active ? "primary.main" : "inherit",
                      }}
                    >
                      <Badge badgeContent={item.count > 0 ? item.count : 0} color="primary" invisible={collapsed || item.count === 0}>
                        <item.Icon />
                      </Badge>
                    </ListItemIcon>
                    {!collapsed && (
                      <ListItemText
                        primary={item.label}
                        primaryTypographyProps={{
                          fontWeight: active ? 700 : 500,
                          fontSize: "0.875rem"
                        }}
                      />
                    )}
                  </ListItemButton>
                </Tooltip>
              </ListItem>
            );
          })}
      </List>
    </Drawer>
  );
}

