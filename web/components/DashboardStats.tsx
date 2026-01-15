"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { fetchBottles } from "../lib/bottles/client";
import { useTranslations } from "../lib/i18n/I18nProvider";
import { PlusIcon } from "./Icon";

const queryKey = ["bottles"] as const;

export function DashboardStats() {
    const { t } = useTranslations();
    const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    const { data: bottles = [] } = useQuery({ queryKey, queryFn: () => fetchBottles() });

    useEffect(() => {
        if (!isAddMenuOpen) return;
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsAddMenuOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [isAddMenuOpen]);

    const activeBottles = Array.isArray(bottles) ? bottles : [];

    // Calculate total bottles by summing quantity
    const totalBottles = activeBottles.reduce((acc, b) => acc + (b.quantity || 1), 0);

    // Calculate total value (price * quantity)
    const totalValue = activeBottles.reduce((acc, b) => {
        const price = b.estimatedValue || b.purchasePrice || 0;
        return acc + (price * (b.quantity || 1));
    }, 0);

    // Calculate 'to drink' count taking quantity into account
    const toDrink = activeBottles.reduce((acc, b) => {
        if (b.peakMaturity?.to && b.peakMaturity.to <= new Date().getFullYear()) {
            return acc + (b.quantity || 1);
        }
        return acc;
    }, 0);

    return (
        <section className="panel">
            <header className="panel__header">
                <div>
                    <p className="eyebrow">{t("app.collection")}</p>
                    <h2>{t("dashboard.overview")}</h2>
                </div>
                <div className="actions-inline" ref={menuRef}>
                    <div className="user-menu">
                        <button
                            className="primary"
                            onClick={() => setIsAddMenuOpen(!isAddMenuOpen)}
                            aria-haspopup="true"
                            aria-expanded={isAddMenuOpen}
                            style={{ display: "flex", alignItems: "center", gap: "8px" }}
                        >
                            <PlusIcon />
                            {t("actions.add")}
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M6 9l6 6 6-6" />
                            </svg>
                        </button>
                        {isAddMenuOpen && (
                            <div className="user-menu__dropdown" style={{ minWidth: "180px", right: 0 }}>
                                <Link
                                    href="/bottles?new=true&category=wine"
                                    className="user-menu__item"
                                    style={{ display: "flex", width: "100%", alignItems: "center", textDecoration: "none", color: "inherit" }}
                                    onClick={() => setIsAddMenuOpen(false)}
                                >
                                    🍷 {t("categories.wine")} / {t("categories.spirit")}
                                </Link>
                                <Link
                                    href="/bottles?new=true&category=cigar"
                                    className="user-menu__item"
                                    style={{ display: "flex", width: "100%", alignItems: "center", textDecoration: "none", color: "inherit" }}
                                    onClick={() => setIsAddMenuOpen(false)}
                                >
                                    🚬 {t("categories.cigar")}
                                </Link>
                            </div>
                        )}
                    </div>
                </div>
            </header>
            <div className="stats-grid">
                <div className="stat-card">
                    <span className="stat-card__label">{t("stats.totalBottles")}</span>
                    <span className="stat-card__value">{totalBottles}</span>
                </div>
                <div className="stat-card">
                    <span className="stat-card__label">{t("stats.totalValue")}</span>
                    <span className="stat-card__value">€{totalValue.toLocaleString()}</span>
                </div>
                <div className="stat-card">
                    <span className="stat-card__label">{t("stats.toDrink")}</span>
                    <span className="stat-card__value">{toDrink}</span>
                </div>
            </div>
        </section>
    );
}
