"use client";

import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth/client";
import { useLocale } from "@/lib/i18n/I18nProvider";
import LoadingWine from "../LoadingWine";

interface Session {
  id: string;
  deviceName?: string;
  ipAddress?: string;
  isTrusted: boolean;
  lastActivityAt: string;
  expiresAt: string;
  createdAt: string;
  isCurrent: boolean;
}

export function SessionManagement() {
  const t = useLocale();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadSessions();
  }, []);

  const loadSessions = async () => {
    try {
      setIsLoading(true);
      const data = await authClient.listSessions();
      setSessions(data);
      setTimeout(() => setError(null), 0);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load sessions";
      setTimeout(() => setError(message), 0);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRevokeSession = async (sessionId: string) => {
    if (!confirm(t("security.confirmAction"))) return;

    try {
      await authClient.revokeSession(sessionId);
      setSessions(sessions.filter((s) => s.id !== sessionId));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to revoke session";
      setTimeout(() => setError(message), 0);
    }
  };

  const handleTrustDevice = async () => {
    try {
      const deviceName = prompt(t("sessions.deviceNamePrompt"));
      if (deviceName) {
        await authClient.trustDevice(deviceName);
        await loadSessions();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to trust device";
      setTimeout(() => setError(message), 0);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  if (isLoading) {
    return (
      <div className="text-center py-4">
        <LoadingWine />
      </div>
    );
  }

  return (
    <div className="form">
      {error && (
        <div className="section" style={{ borderColor: "var(--danger)", color: "var(--text)", marginBottom: 16 }}>
          {error}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div className="section__title" style={{ marginBottom: 0 }}>
          {t("sessions.activeSessions")} ({sessions.length})
        </div>
        <button type="button" onClick={handleTrustDevice} className="primary small">
          {t("sessions.trustDevice")}
        </button>
      </div>

      {sessions.length === 0 ? (
        <p className="section__hint">{t("sessions.noSessions")}</p>
      ) : (
        <div className="grid" style={{ gridTemplateColumns: "1fr" }}>
          {sessions.map((session) => (
            <div
              key={session.id}
              className="section"
              style={{ background: "var(--bg)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 600, color: "var(--text)" }}>
                    {session.deviceName || t("sessions.unknownDevice")}
                  </span>
                  {session.isCurrent && (
                    <span style={{ fontSize: 10, background: "var(--accent)", color: "#fff", padding: "2px 6px", borderRadius: 4 }}>
                      {t("sessions.currentSession")}
                    </span>
                  )}
                  {session.isTrusted && (
                    <span style={{ fontSize: 10, background: "var(--success)", color: "#fff", padding: "2px 6px", borderRadius: 4 }}>
                      {t("sessions.trustDevice")}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 12, marginTop: 4, opacity: 0.8 }}>
                  {t("sessions.ipAddress")}: {session.ipAddress || t("sessions.notAvailable")}
                </div>
                <div style={{ fontSize: 11, opacity: 0.6, marginTop: 2 }}>
                  {t("sessions.lastActivity")}: {formatDate(session.lastActivityAt)}
                </div>
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                {!session.isCurrent && (
                  <button
                    type="button"
                    onClick={() => handleRevokeSession(session.id)}
                    className="danger small"
                  >
                    {t("sessions.revokeSession")}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
