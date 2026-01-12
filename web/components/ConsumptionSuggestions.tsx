import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "../lib/i18n/I18nProvider";

export function ConsumptionSuggestions() {
  const { t } = useTranslations();
  const { data, isLoading, error } = useQuery({
    queryKey: ["consumption-suggestions"],
    queryFn: async () => {
      const res = await fetch("/api/consumption-plan/suggestions", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch suggestions");
      return (await res.json()).data as Array<{
        bottleId: string;
        reason: string;
        score: number;
      }>;
    },
  });

  if (isLoading) return <div>{t("loading")}</div>;
  if (error) return <div>{t("error")}</div>;
  if (!data || data.length === 0) return <div>{t("consumption.suggestion.none")}</div>;

  return (
    <div>
      <h2>{t("consumption.suggestion.title")}</h2>
      <ul>
        {data.map((s) => (
          <li key={s.bottleId}>
            <span>{t(s.reason.split(",")[0])}</span> {/* Affiche la première raison */}
            <span style={{ marginLeft: 8, color: "#888" }}>({s.score})</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
