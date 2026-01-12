"use client";

import { useEffect, useState } from "react";
import { BottleDashboard } from "./BottleDashboard";
import { PageTitle } from "./PageTitle";
import { ConsumptionSuggestions } from "./ConsumptionSuggestions";
import { FoodToBottlePairing } from "./FoodToBottlePairing";
import { useTranslations } from "../lib/i18n/I18nProvider";
import { bottlesClient } from "../lib/bottles/client";
import { cellarsClient } from "../lib/cellars/client";

export function BottleDashboardWrapper() {
  const [isHydrated, setIsHydrated] = useState(false);
  const { t } = useTranslations();

  function KpiBar() {
    const [total, setTotal] = useState<number | null>(null);
    const [openCount, setOpenCount] = useState<number | null>(null);
    const [cellars, setCellars] = useState<number | null>(null);

    useEffect(() => {
      let mounted = true;
      (async () => {
        try {
          const bottles = await bottlesClient.list();
          if (!mounted) return;
          setTotal(bottles.length);
          setOpenCount(bottles.filter(b => b.isOpened).length);
        } catch (e) {
          // ignore failures silently for KPI bar
        }
        try {
          const cellarsList = await cellarsClient.getCellars();
          if (!mounted) return;
          setCellars(cellarsList.length);
        } catch (e) {
          // ignore
        }
      })();
      return () => {
        mounted = false;
      };
    }, []);

    return (
      <div className="kpi-grid" style={{ display: "flex", gap: 12, marginBottom: 16 }}>
        <div className="kpi-card">
          <div className="kpi-label">{t("dashboard.kpis.totalBottles")}</div>
          <div className="kpi-value">{total ?? "—"}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">{t("dashboard.kpis.openBottles")}</div>
          <div className="kpi-value">{openCount ?? "—"}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">{t("dashboard.kpis.cellars")}</div>
          <div className="kpi-value">{cellars ?? "—"}</div>
        </div>
      </div>
    );
  }

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  if (!isHydrated) {
    return null; // Avoid hydration mismatch by rendering nothing on server
  }

  return (
    <>
      <PageTitle pageKey="dashboard" />
      <KpiBar />
      <FoodToBottlePairing />
      <BottleDashboard />
      <ConsumptionSuggestions />
    </>
  );
}
