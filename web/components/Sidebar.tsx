"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "../lib/i18n/I18nProvider";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useCellars } from "../lib/cellars/store";
import { bottlesClient } from "../lib/bottles/client";
import { cigarsClient } from "../lib/cigars/client";
import { fetchAppSettings } from "../lib/profile/client";
import { DashboardIcon, BottlesIcon, CellarsIcon, CigarsIcon } from "./Icon";

export default function Sidebar() {
  const { t } = useTranslations();

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
    queryFn: () => cigarsClient.list(),
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
    { href: "/dashboard", label: t("nav.dashboard"), Icon: DashboardIcon, show: true },
    { href: "/bottles", label: t("nav.bottles"), Icon: BottlesIcon, show: bottlesCount > 0 || hasWineCellar },
    { href: "/cellars", label: t("nav.cellars"), Icon: CellarsIcon, show: true },
    { href: "/cigars", label: t("nav.cigars"), Icon: CigarsIcon, show: cigarsCount > 0 || hasCigarCellar },
  ];

  return (
    <aside className={`sidebar ${collapsed ? "collapsed" : ""}`} aria-label={t("nav.dashboard")}>
      <div className="sidebar__brand">
        <Link href="/" className="sidebar__logo">
          {settings?.logoUrl ? (
            <img src={settings.logoUrl} alt="Logo" className="sidebar__logo-img" />
          ) : (
            <span className="sidebar__logo-text">{settings?.appName?.[0] || "G"}</span>
          )}
        </Link>
        {!collapsed && (
          <div className="sidebar__brand-info">
            <span className="sidebar__app-name">{settings?.appName || "Glou"}</span>
            {settings?.appTagline && <span className="sidebar__tagline">{settings.appTagline}</span>}
          </div>
        )}
        <button
          aria-pressed={collapsed}
          aria-label={collapsed ? t("nav.expand") : t("nav.collapse")}
          className="sidebar__toggle"
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? "›" : "‹"}
        </button>
      </div>

      <nav className="sidebar__nav">
        {items
          .filter((it) => it.show)
          .map((item) => {
            const active = pathname === item.href || (item.href !== "/" && pathname?.startsWith(item.href));
            const IconComp = item.Icon;
            return (
              <Link key={item.href} href={item.href} className={`sidebar__item ${active ? "active" : ""}`}>
                <span className="item-icon" aria-hidden>
                  <IconComp />
                </span>
                <span className="item-label">{item.label}</span>
              </Link>
            );
          })}
      </nav>


    </aside>
  );
}

