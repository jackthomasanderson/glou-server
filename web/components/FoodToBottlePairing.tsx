import { useState, useEffect } from "react";
import { useTranslations } from "../lib/i18n/I18nProvider";
import { useAuth } from "../lib/auth/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { fetchAppSettings } from "@/lib/profile/client";

export function FoodToBottlePairing() {
  const { t } = useTranslations();
  const { user } = useAuth();
  const [food, setFood] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: appSettings } = useQuery({
    queryKey: ["app-settings"],
    queryFn: fetchAppSettings,
    staleTime: 30_000,
  });

  const isAIEnabled = !!(user?.aiApiKey || appSettings?.aiApiKey);

  if (!isAIEnabled) {
    return null;
  }

  async function handleSuggest(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/food-pairing/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ prompt: `Je vais manger : ${food}. Quelles bouteilles de mon stock conviendraient le mieux ? Donne la liste triée par adéquation, avec une justification courte pour chaque.` }),
      });
      if (!res.ok) throw new Error("API error");
      const data = await res.json();
      setResult(data.data);
    } catch {
      setError(t("foodPairing.error"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="panel" style={{ marginBottom: 24 }}>
      <header className="panel__header">
        <div>
          <p className="eyebrow">{t("app.suggestions")}</p>
          <h2>{t("foodPairing.title")}</h2>
        </div>
      </header>

      <form onSubmit={handleSuggest} className="form" style={{ flexDirection: "row", alignItems: "flex-end", gap: 12 }}>
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor="food-input">{t("foodPairing.foodPlaceholder")}</label>
          <input
            id="food-input"
            type="text"
            value={food}
            onChange={(e) => setFood(e.target.value)}
            placeholder={t("foodPairing.foodPlaceholder")}
          />
        </div>
        <button className="primary" type="submit" disabled={loading || !food.trim()} style={{ height: 44 }}>
          {loading ? t("loading") : t("foodPairing.suggest")}
        </button>
      </form>

      {error && (
        <div className="field__error" style={{ marginTop: 12 }}>
          {error}
        </div>
      )}

      {result && (
        <div style={{
          marginTop: 20,
          padding: 16,
          background: "var(--bg)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius)",
          whiteSpace: "pre-wrap",
          fontSize: "13px",
          lineHeight: "1.6",
          color: "var(--text)"
        }}>
          {result}
        </div>
      )}
    </section>
  );
}
