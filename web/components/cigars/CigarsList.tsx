"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "@/lib/i18n/I18nProvider";
import { cigarsClient } from "@/lib/cigars/client";
import { PageTitle } from "@/components/PageTitle";

export function CigarsList() {
  const [items, setItems] = useState<Array<{ id: string; name: string; origin?: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      try {
        const data = await cigarsClient.list();
        if (!mounted) return;
        setItems(data);
      } catch (err: any) {
        if (!mounted) return;
        setError(err?.message || String(err));
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, []);

  const { t } = useTranslations();

  return (
    <div>
      <PageTitle pageKey="cigars" />
      {loading ? (
        <div className="generic-loader" role="status" aria-live="polite">
          <div className="spinner" />
          <div className="loader-lines">
            <div className="line long" />
            <div className="line short" />
          </div>
          <div className="loader-message">{t("cigars.loading")}</div>
        </div>
      ) : error ? (
        <div className="panel">
          <h3>Error</h3>
          <p>{error}</p>
        </div>
      ) : items.length === 0 ? (
        <div className="empty">
          <h3>{t("cigars.emptyTitle")}</h3>
          <p>{t("cigars.emptyHint")}</p>
        </div>
      ) : (
        <div className="grid">
          {items.map((c) => (
            <div key={c.id} className="card">
              <div className="card__header">
                <h3>{c.name}</h3>
                <div className="muted">{c.origin}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
