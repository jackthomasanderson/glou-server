"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "../lib/i18n/I18nProvider";
import { DashboardIcon, BottlesIcon, CellarsIcon, ProfileIcon } from "./Icon";
import { useEffect, useState } from "react";
import { bottlesClient } from "../lib/bottles/client";
import { cigarsClient } from "../lib/cigars/client";

export default function BottomNav() {
  const { t } = useTranslations();

  const pathname = usePathname();

  const [bottlesCount, setBottlesCount] = useState<number | null>(null);
  const [cigarsCount, setCigarsCount] = useState<number | null>(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
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
    load();
    return () => {
      mounted = false;
    };
  }, []);

  const items = [
    { href: "/dashboard", label: t("nav.dashboard"), Icon: DashboardIcon, show: true },
    { href: "/bottles", label: t("nav.bottles"), Icon: BottlesIcon, show: bottlesCount !== null ? bottlesCount > 0 : false },
    { href: "/cellars", label: t("nav.cellars"), Icon: CellarsIcon, show: true },
    { href: "/profile", label: t("pageTitles.profile"), Icon: ProfileIcon, show: true },
  ];

  return (
    <nav className="bottom-nav" role="navigation" aria-label={t("nav.dashboard")}>
      {items
        .filter((it) => it.show)
        .map((it) => {
          const active = pathname === it.href || (it.href !== "/" && pathname?.startsWith(it.href));
          const IconComp = it.Icon;
          return (
            <Link key={it.href} href={it.href} className={`bottom-nav__item ${active ? "active" : ""}`}>
              <span className="item-icon" aria-hidden><IconComp /></span>
              <span className="item-label">{it.label}</span>
            </Link>
          );
        })}
      <Link href="/bottles/new" className="bottom-nav__fab" aria-label={t("actions.add")}>+</Link>
    </nav>
  );
}
