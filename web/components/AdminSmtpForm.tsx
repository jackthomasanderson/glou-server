"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "../lib/i18n/I18nProvider";
import { fetchAppSettings, updateAppSettings, type AppSettings } from "../lib/profile/client";

export function AdminSmtpForm() {
    const { t } = useTranslations();
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [settings, setSettings] = useState<Partial<AppSettings>>({});

    useEffect(() => {
        async function load() {
            try {
                setLoading(true);
                const data = await fetchAppSettings();
                setSettings(data);
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        }
        load();
    }, []);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setLoading(true);
        setSuccess(false);
        setError(null);
        try {
            await updateAppSettings({
                smtpHost: settings.smtpHost,
                smtpPort: settings.smtpPort,
                smtpUser: settings.smtpUser,
                smtpPass: settings.smtpPass,
                smtpFrom: settings.smtpFrom,
                smtpSecure: settings.smtpSecure,
            });
            setSuccess(true);
        } catch (err) {
            setError(t("errors.serverError"));
        } finally {
            setLoading(false);
        }
    }

    return (
        <form onSubmit={handleSubmit} className="section">
            <div className="section__title">{t("admin.smtpTitle") || "SMTP Configuration"}</div>

            <div className="grid">
                <label className="field">
                    {t("admin.smtpHost")}
                    <input
                        value={settings.smtpHost ?? ""}
                        onChange={e => setSettings(s => ({ ...s, smtpHost: e.target.value }))}
                        placeholder={t("admin.smtpHostPlaceholder")}
                    />
                </label>

                <label className="field">
                    {t("admin.smtpPort")}
                    <input
                        type="number"
                        value={settings.smtpPort ?? ""}
                        onChange={e => setSettings(s => ({ ...s, smtpPort: parseInt(e.target.value) || 0 }))}
                        placeholder={t("admin.smtpPortPlaceholder")}
                    />
                </label>

                <label className="field">
                    {t("admin.smtpUser")}
                    <input
                        value={settings.smtpUser ?? ""}
                        onChange={e => setSettings(s => ({ ...s, smtpUser: e.target.value }))}
                        placeholder={t("admin.smtpUserPlaceholder")}
                    />
                </label>

                <label className="field">
                    {t("admin.smtpPass")}
                    <input
                        type="password"
                        value={settings.smtpPass ?? ""}
                        onChange={e => setSettings(s => ({ ...s, smtpPass: e.target.value }))}
                        placeholder={t("admin.smtpPassPlaceholder")}
                    />
                </label>

                <label className="field">
                    {t("admin.smtpFrom")}
                    <input
                        value={settings.smtpFrom ?? ""}
                        onChange={e => setSettings(s => ({ ...s, smtpFrom: e.target.value }))}
                        placeholder={t("admin.smtpFromPlaceholder")}
                    />
                </label>

                <label className="field" style={{ display: "flex", alignItems: "center", gap: 8, flexDirection: "row", marginTop: 24 }}>
                    <input
                        type="checkbox"
                        checked={!!settings.smtpSecure}
                        onChange={e => setSettings(s => ({ ...s, smtpSecure: e.target.checked }))}
                        style={{ width: "auto" }}
                    />
                    {t("admin.smtpSecure")}
                </label>
            </div>

            <div className="form__actions">
                <button type="submit" className="primary" disabled={loading}>
                    {loading ? t("loading") : t("admin.saveSmtp")}
                </button>
            </div>

            {success && <div style={{ color: "var(--success)", marginTop: 8 }}>{t("admin.smtpSaved")}</div>}
            {error && <div style={{ color: "var(--danger)", marginTop: 8 }}>{error}</div>}
        </form>
    );
}
