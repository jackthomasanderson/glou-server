"use client";

import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth/client";
import { useLocale } from "@/lib/i18n/I18nProvider";

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
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load sessions";
      setError(message);
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
      setError(message);
    }
  };

  const handleTrustDevice = async (sessionId: string) => {
    try {
      const deviceName = prompt("Device name:");
      if (deviceName) {
        await authClient.trustDevice(deviceName);
        await loadSessions();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to trust device";
      setError(message);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  if (isLoading) {
    return <div className="text-center py-4">{t("list.loading")}</div>;
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-red-700 dark:text-red-300 text-sm">
          {error}
        </div>
      )}

      <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
        {t("sessions.activeSessions")} ({sessions.length})
      </h3>

      {sessions.length === 0 ? (
        <p className="text-slate-600 dark:text-slate-400">{t("sessions.noSessions")}</p>
      ) : (
        <div className="space-y-3">
          {sessions.map((session) => (
            <div
              key={session.id}
              className="p-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="font-medium text-slate-900 dark:text-white">
                      {session.deviceName || "Unknown Device"}
                    </h4>
                    {session.isCurrent && (
                      <span className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2 py-1 rounded">
                        {t("sessions.currentSession")}
                      </span>
                    )}
                    {session.isTrusted && (
                      <span className="text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-2 py-1 rounded">
                        {t("sessions.trustDevice")}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                    {t("sessions.ipAddress")}: {session.ipAddress || "N/A"}
                  </p>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    {t("sessions.lastActivity")}: {formatDate(session.lastActivityAt)}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-500 mt-1">
                    {t("sessions.approxIpAddress")} • {formatDate(session.createdAt)}
                  </p>
                </div>

                <div className="flex gap-2">
                  {!session.isCurrent && !session.isTrusted && (
                    <button
                      onClick={() => handleTrustDevice(session.id)}
                      className="px-3 py-1 text-sm bg-green-600 hover:bg-green-700 text-white rounded transition-colors"
                    >
                      {t("sessions.trustDevice")}
                    </button>
                  )}
                  {!session.isCurrent && (
                    <button
                      onClick={() => handleRevokeSession(session.id)}
                      className="px-3 py-1 text-sm bg-red-600 hover:bg-red-700 text-white rounded transition-colors"
                    >
                      {t("sessions.revokeSession")}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
