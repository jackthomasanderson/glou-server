"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "../../../lib/i18n/I18nProvider";

export default function NewCigarPage() {
  const { t } = useTranslations();
  const router = useRouter();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/cigars', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || res.statusText || 'Failed');
      }
      router.push('/cigars');
    } catch (err) {
      setError(err?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ padding: 16 }}>
      <h2>{t("nav.cigars")}</h2>
      <form onSubmit={handleSubmit}>
        <div>
          <label>{t("fields.name")}</label>
          <input value={name} onChange={(e) => setName(e.target.value)} required className="input" />
        </div>
        {error && <div className="error">{error}</div>}
        <div style={{ marginTop: 12 }}>
          <button type="submit" disabled={saving}>{saving ? t("actions.save") : t("actions.save")}</button>
        </div>
      </form>
    </div>
  );
}
