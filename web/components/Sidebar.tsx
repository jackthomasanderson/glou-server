"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "../lib/i18n/I18nProvider";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { bottlesClient } from "../lib/bottles/client";
import { cigarsClient } from "../lib/cigars/client";
import { fetchAppSettings } from "../lib/profile/client";
import { DashboardIcon, BottlesIcon, CellarsIcon, CigarsIcon, ProfileIcon, BellIcon } from "./Icon";

export default function Sidebar() {
  const { t } = useTranslations();

  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [bottlesCount, setBottlesCount] = useState<number | null>(null);
  const [cigarsCount, setCigarsCount] = useState<number | null>(null);

  const { data: settings } = useQuery({
    queryKey: ["app-settings"],
    queryFn: fetchAppSettings,
    staleTime: 60_000,
  });

  useEffect(() => {
    try {
      const v = localStorage.getItem("glou-sidebar-collapsed");
      if (v === "1") setCollapsed(true);
    } catch { }
  }, []);

  useEffect(() => {
    let mounted = true;
    async function loadCounts() {
      try {
        const bs = await bottlesClient.list();
        if (!mounted) return;
        setBottlesCount(Array.isArray(bs) ? bs.length : 0);
      } catch {
        setBottlesCount(0);
      }

      try {
        const cs = await cigarsClient.list();
        if (!mounted) return;
        setCigarsCount(Array.isArray(cs) ? cs.length : 0);
      } catch {
        setCigarsCount(0);
      }
    }

    loadCounts();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("glou-sidebar-collapsed", collapsed ? "1" : "0");
    } catch { }
  }, [collapsed]);

  const items = [
    { href: "/dashboard", label: t("nav.dashboard"), Icon: DashboardIcon, show: true },
    { href: "/bottles", label: t("nav.bottles"), Icon: BottlesIcon, show: bottlesCount !== null ? bottlesCount > 0 : false },
    { href: "/cellars", label: t("nav.cellars"), Icon: CellarsIcon, show: true },
    { href: "/cigars", label: t("nav.cigars"), Icon: CigarsIcon, show: cigarsCount !== null ? cigarsCount > 0 : false },
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

      <div className="sidebar__footer">
        <Link
          href="/profile"
          className={`sidebar__item ${pathname?.startsWith("/profile") ? "active" : ""}`}
          style={{ justifyContent: "space-between", width: "100%" }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span className="item-icon" aria-hidden>
              <ProfileIcon />
            </span>
            <span className="item-label">{t("header.userMenu.profile")}</span>
          </div>
          {!collapsed && (
            <span className="sidebar__notif-bell" title="Notifications">
              <BellIcon />
            </span>
          )}
        </Link>
      </div>
    </aside>
  );
}

