"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "../lib/i18n/I18nProvider";
import { bottlesClient } from "../lib/bottles/client";
import {
  BottomNavigation,
  BottomNavigationAction,
  Paper,
  Fab,
  Box,
  Badge,
} from "@mui/material";
import {
  Dashboard as DashboardIcon,
  WineBar as BottlesIcon,
  Kitchen as CellarsIcon,
  Person as ProfileIcon,
  Add as AddIcon,
} from "@mui/icons-material";

export default function BottomNav() {
  const { t } = useTranslations();
  const pathname = usePathname();
  const router = useRouter();

  const [bottlesCount, setBottlesCount] = useState<number | null>(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const bs = await bottlesClient.list();
        if (!mounted) return;
        setBottlesCount(Array.isArray(bs) ? bs.length : 0);
      } catch {
        setBottlesCount(0);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, []);

  const items = [
    { href: "/dashboard", label: t("nav.dashboard"), icon: <DashboardIcon />, show: true },
    {
      href: "/bottles",
      label: t("nav.bottles"),
      icon: (
        <Badge badgeContent={bottlesCount} color="primary">
          <BottlesIcon />
        </Badge>
      ),
      show: bottlesCount !== null ? bottlesCount > 0 : false
    },
    { href: "/cellars", label: t("nav.cellars"), icon: <CellarsIcon />, show: true },
  ];

  const activeIndex = items.findIndex(it => pathname === it.href || (it.href !== "/" && pathname?.startsWith(it.href)));

  return (
    <Box sx={{ display: { xs: 'block', md: 'none' } }}>
      <Paper sx={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 1000 }} elevation={3}>
        <BottomNavigation
          showLabels
          value={activeIndex === -1 ? false : activeIndex}
          onChange={(_, newValue) => {
            router.push(items[newValue].href);
          }}
        >
          {items
            .filter((it) => it.show)
            .map((item, idx) => (
              <BottomNavigationAction
                key={item.href}
                label={item.label}
                icon={item.icon}
              />
            ))}
        </BottomNavigation>
      </Paper>
      <Fab
        color="primary"
        aria-label={t("actions.add")}
        sx={{
          position: 'fixed',
          bottom: 70,
          right: 16,
          zIndex: 1001,
        }}
        onClick={() => router.push("/bottles?new=true&category=wine")}
      >
        <AddIcon />
      </Fab>
    </Box>
  );
}
