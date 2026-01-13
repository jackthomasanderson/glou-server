"use client";

import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";

export function AdminAiApiKeyForm() {
  const { t } = useTranslation();
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);


  async function saveKey(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => setError(null), 0);
    setSuccess(false);
    try {
      const res = await fetch("/api/admin/ai-api-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ aiApiKey: value })
      });
      if (!res.ok) throw new Error("saveError");
      setSuccess(true);
    } catch {
      setTimeout(() => setError(t("admin.aiApiKey.saveError")), 0);
    } finally {
      setLoading(false);
    }
  }

  // Chargement initial
  useEffect(() => {
    async function fetchKey() {
      setLoading(true);
      setTimeout(() => setError(null), 0);
      try {
        const res = await fetch("/api/admin/ai-api-key", { credentials: "include" });
        if (!res.ok) throw new Error("fetchError");
        const data = await res.json();
        setValue(data.aiApiKey || "");
      } catch {
        setTimeout(() => setError(t("admin.aiApiKey.fetchError")), 0);
      } finally {
        setLoading(false);
      }
    }
    fetchKey();
  }, [t]);

  return (
    <form onSubmit={saveKey}>
      <label>
        {t("admin.aiApiKey.label")}
        <input
          type="text"
          value={value}
          onChange={e => setValue(e.target.value)}
          placeholder={t("admin.aiApiKey.placeholder")}
          disabled={loading}
          style={{ width: 400 }}
        />
      </label>
      <button type="submit" disabled={loading}>
        {loading ? t("loading") : t("admin.aiApiKey.save")}
      </button>
      {success && <span style={{ color: "green", marginLeft: 8 }}>{t("admin.aiApiKey.success")}</span>}
      {error && <span style={{ color: "red", marginLeft: 8 }}>{error}</span>}
    </form>
  );
}
