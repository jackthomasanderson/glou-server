import { useState } from "react";
import { useTranslations } from "@/lib/i18n/I18nProvider";
import { useAiApiKeyAvailable } from "../lib/ai/useAiApiKeyAvailable";

type BottleToFoodPairingProps = {
  bottle: { name: string; description?: string };
};

export function BottleToFoodPairing({ bottle }: BottleToFoodPairingProps) {
  const { t } = useTranslations();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const aiAvailable = useAiApiKeyAvailable();

  async function handleSuggest() {
    setLoading(true);
    setTimeout(() => setError(null), 0);
    setResult(null);
    try {
      const res = await fetch("/api/food-pairing/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bottle: bottle.name, description: bottle.description }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("apiError");
      const data = await res.json();
      setResult(data.suggestion);
    } catch {
      setTimeout(() => setError(t("foodPairing.error")), 0);
    } finally {
      setLoading(false);
    }
  }

  if (aiAvailable === false) {
    return <div className="food-pairing__unavailable">{t("foodPairing.unavailable")}</div>;
  }
  if (aiAvailable === null) {
    return <div className="food-pairing__loading">{t("loading")}</div>;
  }

  return (
    <div className="food-pairing">
      <button type="button" className="ghost" onClick={handleSuggest} disabled={loading}>
        {loading ? t("loading") : t("foodPairing.suggestFood")}
      </button>
      {result && <div className="food-pairing__result">{result}</div>}
      {error && <div className="food-pairing__error">{error}</div>}
    </div>
  );
}
