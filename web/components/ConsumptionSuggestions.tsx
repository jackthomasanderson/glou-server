import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "../lib/i18n/I18nProvider";
import { useAuth } from "../lib/auth/AuthContext";
import { fetchAppSettings } from "@/lib/profile/client";

export function ConsumptionSuggestions() {
  const { t } = useTranslations();
  const { user } = useAuth();

  const { data: appSettings } = useQuery({
    queryKey: ["app-settings"],
    queryFn: fetchAppSettings,
    staleTime: 30_000,
  });

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

  if (isLoading) return <div className="generic-loader"><div className="spinner"></div></div>;
  if (error) return <div className="field__error" style={{ padding: 20 }}>{t("error")}</div>;

  const hasData = data && data.length > 0;

  return (
    <section className="panel" style={{ marginTop: 24 }}>
      <header className="panel__header">
        <div>
          <p className="eyebrow">{t("app.suggestions")}</p>
          <h2>{t("consumption.suggestion.title")}</h2>
        </div>
      </header>

      {!hasData ? (
        <p className="muted" style={{ padding: "20px 0" }}>{t("consumption.suggestion.none")}</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 12 }}>
          {data.map((s) => (
            <li key={s.bottleId} style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "12px 16px",
              background: "var(--bg)",
              borderRadius: "var(--radius)",
              border: "1px solid var(--border)"
            }}>
              <span style={{ fontWeight: 500 }}>{t(s.reason.split(",")[0])}</span>
              <span className="pill info" style={{ fontSize: "11px" }}>{s.score}%</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
