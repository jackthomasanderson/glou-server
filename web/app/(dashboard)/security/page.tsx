"use client";

import { useState } from "react";
import Image from "next/image";
import { useAuth } from "@/lib/auth/AuthContext";
import { useLocale } from "@/lib/i18n/I18nProvider";
import { authClient } from "@/lib/auth/client";

import LoadingWine from "@/components/LoadingWine";
import { AdminAiApiKeyForm } from "@/components/AdminAiApiKeyForm";

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
  const [success, setSuccess] = useState<string | null>(null);

  // Password change state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isChangingPassword, setIsChangingPassword] = useState(false);

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
      setTimeout(() => setError(null), 0);
      const data = await authClient.setupTOTP();
      setTotpSecret(data.secret);
      setQrCode(data.qrCode);
      setRecoveryCodes(data.recoveryCodes);
      setShowTOTPSetup(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Setup failed";
      setTimeout(() => setError(message), 0);
    } finally {
      setIsSettingUp(false);
    }
  };

  const handleConfirmTOTP = async () => {
    try {
      if (!totpCode) {
        setTimeout(() => setError(t("twoFA.codeRequired")), 0);
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
      setTimeout(() => setError(message), 0);
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
      setTimeout(() => setError(message), 0);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setTimeout(() => setError(t("auth.passwordsMismatch")), 0);
      return;
    }

    try {
      setIsChangingPassword(true);
      setError(null);
      setSuccess(null);
      await authClient.changePassword(currentPassword, newPassword);
      setSuccess(t("security.passwordChangeSuccess"));
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to change password";
      setTimeout(() => setError(message), 0);
    } finally {
      setIsChangingPassword(false);
    }
  };

  return (
    <div className="dashboard">
      <div className="panel">
        <div className="panel__header">
          <div>
            <p className="eyebrow">{t("header.userMenu.security")}</p>
            <h2>{t("security.securityTitle")}</h2>
            <p>{t("security.subtitle")}</p>
          </div>
        </div>

        {error && (
          <div className="section" style={{ borderColor: "var(--danger)", color: "var(--text)", marginBottom: 16 }}>
            {error}
          </div>
        )}

        {success && (
          <div className="section" style={{ borderColor: "var(--success)", marginBottom: 16 }}>
            {success}
          </div>
        )}

        {/* Password Change Section */}
        <div className="section">
          <div className="section__title">{t("security.password")}</div>
          <form onSubmit={handleChangePassword} className="form">
            <div className="grid">
              <label className="field">
                {t("security.currentPassword")}
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                />
              </label>
              <label className="field">
                {t("security.newPassword")}
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                />
              </label>
              <label className="field">
                {t("auth.confirmPassword")}
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
              </label>
            </div>
            <div className="form__actions">
              <button
                type="submit"
                disabled={isChangingPassword}
                className="primary"
              >
                {isChangingPassword ? (t("actions.update") + "...") : t("security.changePassword")}
              </button>
            </div>
          </form>
        </div>

        {/* Two-Factor Authentication Section */}
        <div className="section">
          <div className="section__title">{t("security.twoFactorAuth")}</div>

          {!showTOTPSetup ? (
            <div>
              {user.twoFAEnabled ? (
                <div>
                  <p style={{ color: "var(--success)", marginBottom: 16 }}>
                    ✓ {t("twoFA.enabled")} ({user.twoFAMethod})
                  </p>
                  <button
                    onClick={handleDisableTwoFA}
                    className="danger"
                  >
                    {t("twoFA.disable")}
                  </button>
                </div>
              ) : (
                <div>
                  <p className="section__hint" style={{ marginBottom: 16 }}>
                    {t("twoFA.setupTotp")}
                  </p>
                  <button
                    onClick={handleSetupTOTP}
                    disabled={isSettingUp}
                    className="primary"
                  >
                    {isSettingUp ? (t("twoFA.setupTotp") + "...") : t("twoFA.enable")}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="form">
              <h3 className="section__title">
                {t("twoFA.totpSetupTitle")}
              </h3>

              <div className="grid">
                <div className="field">
                  <p className="section__hint">
                    {t("twoFA.totpSetupStep1")}
                  </p>
                  {qrCode && (
                    <div style={{ background: "#fff", padding: 12, borderRadius: "var(--radius)", display: "inline-block", alignSelf: "flex-start" }}>
                      <Image src={qrCode} alt="QR Code" width={192} height={192} style={{ display: "block" }} />
                    </div>
                  )}
                </div>

                <div className="field">
                  <p className="section__hint">
                    {t("twoFA.totpSetupStep2")}
                  </p>
                  <div style={{ padding: 12, background: "var(--bg)", borderRadius: "var(--radius)", fontFamily: "monospace", fontSize: 13, wordBreak: "break-all" }}>
                    {totpSecret}
                  </div>
                </div>
              </div>

              <div className="grid">
                <label className="field">
                  {t("twoFA.totpSetupStep3")}
                  <input
                    type="text"
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value.slice(0, 6))}
                    maxLength={6}
                    placeholder="000000"
                    style={{ textAlign: "center", letterSpacing: 4, fontWeight: "bold" }}
                  />
                </label>

                <div className="field">
                  <p className="section__title" style={{ fontSize: 13, marginBottom: 4 }}>
                    {t("twoFA.recoveryCodes")}
                  </p>
                  <p className="section__hint" style={{ marginBottom: 8 }}>
                    {t("twoFA.recoveryCodesDescription")}
                  </p>
                  <div style={{ padding: 12, background: "var(--bg)", borderRadius: "var(--radius)", maxHeight: 100, overflowY: "auto" }}>
                    <code style={{ fontSize: 12 }}>
                      {recoveryCodes.join("\n")}
                    </code>
                  </div>
                </div>
              </div>

              <div className="form__actions">
                <button
                  onClick={handleConfirmTOTP}
                  className="primary"
                >
                  {t("twoFA.confirmTotp")}
                </button>
                <button
                  onClick={() => setShowTOTPSetup(false)}
                  className="ghost"
                >
                  {t("actions.cancel")}
                </button>
              </div>
            </div>
          )}
        </div>


      </div>
    </div>
  );
}
