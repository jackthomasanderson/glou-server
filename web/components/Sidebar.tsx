"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "../lib/i18n/I18nProvider";
import { useEffect, useState } from "react";
import { bottlesClient } from "../lib/bottles/client";
import { cigarsClient } from "../lib/cigars/client";
import { DashboardIcon, BottlesIcon, CellarsIcon, CigarsIcon, ProfileIcon } from "./Icon";

export default function Sidebar() {
  const { t } = useTranslations();

  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [bottlesCount, setBottlesCount] = useState<number | null>(null);
  const [cigarsCount, setCigarsCount] = useState<number | null>(null);
  const [showQuick, setShowQuick] = useState(false);

  useEffect(() => {
    try {
      const v = localStorage.getItem("glou-sidebar-collapsed");
      if (v === "1") setCollapsed(true);
    } catch (e) {}
  }, []);

  useEffect(() => {
    let mounted = true;
    async function loadCounts() {
      try {
        const bs = await bottlesClient.list();
        if (!mounted) return;
        setBottlesCount(Array.isArray(bs) ? bs.length : 0);
      } catch (e) {
        setBottlesCount(0);
      }

      try {
        const cs = await cigarsClient.list();
        if (!mounted) return;
        setCigarsCount(Array.isArray(cs) ? cs.length : 0);
      } catch (e) {
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
    } catch (e) {}
  }, [collapsed]);

  const items = [
    { href: "/dashboard", label: t("nav.dashboard"), Icon: DashboardIcon, show: true },
    { href: "/bottles", label: t("nav.bottles"), Icon: BottlesIcon, show: bottlesCount !== null ? bottlesCount > 0 : false },
    { href: "/cellars", label: t("nav.cellars"), Icon: CellarsIcon, show: true },
    { href: "/cigars", label: t("nav.cigars"), Icon: CigarsIcon, show: cigarsCount !== null ? cigarsCount > 0 : false },
    { href: "/profile", label: t("pageTitles.profile"), Icon: ProfileIcon, show: true },
  ];

  return (
    <aside className={`sidebar ${collapsed ? "collapsed" : ""}`} aria-label={t("nav.dashboard")}>
      <div className="sidebar__brand">
        <Link href="/" className="sidebar__logo">Glou</Link>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ position: "relative" }}>
            <button aria-haspopup="menu" aria-expanded={showQuick} aria-label={t("actions.quickAdd")}
              className="sidebar__quick" onClick={() => setShowQuick(!showQuick)}>
              +
            </button>
            {showQuick && (
              <div role="menu" className="sidebar__quickMenu">
                <Link href="/bottles/new" className="sidebar__quickItem">{t("actions.addBottle")}</Link>
                <Link href="/cigars/new" className="sidebar__quickItem">{t("nav.cigars")}</Link>
              </div>
            )}
          </div>
          <button aria-pressed={collapsed} aria-label={collapsed ? t("nav.expand") : t("nav.collapse")} className="sidebar__toggle" onClick={() => setCollapsed(!collapsed)}>
            {collapsed ? "›" : "‹"}
          </button>
        </div>
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
