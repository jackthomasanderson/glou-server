import { useState } from "react";
import { useTranslations } from "../lib/i18n/I18nProvider";

export function FoodToBottlePairing() {
  const { t } = useTranslations();
  const [food, setFood] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSuggest(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => setError(null), 0);
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
    } catch (e) {
      setTimeout(() => setError(t("errors.serverError")), 0);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h2>{t("foodPairing.title")}</h2>
      <form onSubmit={handleSuggest} style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          type="text"
          value={food}
          onChange={(e) => setFood(e.target.value)}
          placeholder={t("foodPairing.foodPlaceholder")}
          style={{ flex: 1 }}
        />
        <button type="submit" disabled={loading || !food.trim()}>
          {loading ? t("loading") : t("foodPairing.suggest")}
        </button>
      </form>
      {error && <div style={{ color: "red" }}>{error}</div>}
      {result && (
        <pre style={{ marginTop: 16, background: "#f7f7f7", padding: 12, borderRadius: 6 }}>{result}</pre>
      )}
    </div>
  );
}
