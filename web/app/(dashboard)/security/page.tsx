"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth/AuthContext";
import { useLocale } from "@/lib/i18n/I18nProvider";
import { authClient } from "@/lib/auth/client";
import { SessionManagement } from "@/components/auth/SessionManagement";
import LoadingWine from "@/components/LoadingWine";

export default function SecurityPage() {
  const { user } = useAuth();
  const t = useLocale();

  const [showTOTPSetup, setShowTOTPSetup] = useState(false);
  const [totpSecret, setTotpSecret] = useState("");
  const [qrCode, setQrCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [totpCode, setTotpCode] = useState("");
  const [isSettingUp, setIsSettingUp] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <LoadingWine />
      </div>
    );
  }

  const handleSetupTOTP = async () => {
    try {
      setIsSettingUp(true);
      setError(null);
      const data = await authClient.setupTOTP();
      setTotpSecret(data.secret);
      setQrCode(data.qrCode);
      setRecoveryCodes(data.recoveryCodes);
      setShowTOTPSetup(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Setup failed";
      setError(message);
    } finally {
      setIsSettingUp(false);
    }
  };

  const handleConfirmTOTP = async () => {
    try {
      if (!totpCode) {
        setError(t("twoFA.codeRequired"));
        return;
      }
      await authClient.enableTOTP(totpSecret, totpCode, recoveryCodes);
      setShowTOTPSetup(false);
      setTotpSecret("");
      setQrCode("");
      setRecoveryCodes([]);
      setTotpCode("");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Verification failed";
      setError(message);
    }
  };

  const handleDisableTwoFA = async () => {
    if (!confirm(t("security.confirmAction"))) return;

    try {
      const password = prompt(t("auth.password"));
      if (!password) return;

      await authClient.disableTwoFA(password);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to disable 2FA";
      setError(message);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">
          {t("security.securityTitle")}
        </h1>
        <p className="text-slate-600 dark:text-slate-400">
          {t("security.subtitle")}
        </p>
      </div>

      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Two-Factor Authentication Section */}
      <section className="bg-white dark:bg-slate-800 rounded-lg p-6 space-y-4">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
          {t("security.twoFactorAuth")}
        </h2>

        {!showTOTPSetup ? (
          <div>
            {user.twoFAEnabled ? (
              <div>
                <p className="text-green-700 dark:text-green-300 mb-4">
                  ✓ {t("twoFA.enabled")} ({user.twoFAMethod})
                </p>
                <button
                  onClick={handleDisableTwoFA}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
                >
                  {t("twoFA.disable")}
                </button>
              </div>
            ) : (
              <div>
                <p className="text-slate-600 dark:text-slate-400 mb-4">
                  {t("twoFA.setupTotp")}
                </p>
                <button
                  onClick={handleSetupTOTP}
                  disabled={isSettingUp}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400 text-white rounded-lg transition-colors"
                >
                  {isSettingUp ? t("twoFA.setupTotp") + "..." : t("twoFA.enable")}
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <h3 className="text-lg font-medium text-slate-900 dark:text-white">
              {t("twoFA.totpSetupTitle")}
            </h3>

            <div className="space-y-2">
              <p className="text-sm text-slate-600 dark:text-slate-400">
                {t("twoFA.totpSetupStep1")}
              </p>
              {qrCode && (
                <div className="bg-white p-4 rounded-lg inline-block">
                  <img src={qrCode} alt="QR Code" className="w-48 h-48" />
                </div>
              )}
            </div>

            <div className="space-y-2">
              <p className="text-sm text-slate-600 dark:text-slate-400">
                {t("twoFA.totpSetupStep2")}
              </p>
              <div className="bg-slate-100 dark:bg-slate-700 p-3 rounded font-mono text-sm break-all">
                {totpSecret}
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-900 dark:text-white">
                {t("twoFA.totpSetupStep3")}
              </p>
              <input
                type="text"
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.slice(0, 6))}
                maxLength={6}
                placeholder="000000"
                className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-center text-lg tracking-widest"
              />
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-900 dark:text-white">
                {t("twoFA.recoveryCodes")}
              </p>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                {t("twoFA.recoveryCodesDescription")}
              </p>
              <div className="bg-slate-100 dark:bg-slate-700 p-3 rounded">
                <code className="text-xs whitespace-pre-wrap break-words">
                  {recoveryCodes.join("\n")}
                </code>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleConfirmTOTP}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              >
                {t("twoFA.confirmTotp")}
              </button>
              <button
                onClick={() => setShowTOTPSetup(false)}
                className="px-4 py-2 bg-slate-300 dark:bg-slate-600 hover:bg-slate-400 dark:hover:bg-slate-700 text-slate-900 dark:text-white rounded-lg transition-colors"
              >
                {t("actions.reset")}
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Sessions Section */}
      <section className="bg-white dark:bg-slate-800 rounded-lg p-6">
        <SessionManagement />
      </section>
    </div>
  );
}
