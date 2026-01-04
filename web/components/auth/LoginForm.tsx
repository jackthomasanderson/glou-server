"use client";

import { useState, FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthContext";
import { useLocale } from "@/lib/i18n/I18nProvider";

export function LoginForm() {
  const router = useRouter();
  const { login } = useAuth();
  const t = useLocale();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [requires2FA, setRequires2FA] = useState(false);
  const [tempToken, setTempToken] = useState("");
  const [userId, setUserId] = useState("");
  const [twoFAMethod, setTwoFAMethod] = useState("");

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const result = await login(username, password);

      if ("requiresTwoFA" in result && result.requiresTwoFA) {
        setRequires2FA(true);
        setTempToken(result.tempToken);
        setUserId(result.userId);
        setTwoFAMethod(result.twoFAMethod);
      } else {
        router.push("/dashboard");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : t("auth.errors.serverError");
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  if (requires2FA) {
    return (
      <TwoFAVerification userId={userId} tempToken={tempToken} method={twoFAMethod} />
    );
  }

  return (
    <div className="panel auth-card">
      <header className="auth-header">
        <p className="eyebrow">{t("app.name")}</p>
        <h1 className="auth-title">{t("auth.loginTitle")}</h1>
        <p className="auth-subtitle">{t("auth.loginSubtitle")}</p>
      </header>

      {error && (
        <div className="auth-alert" role="alert">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="form">
        <div className="field">
          <label htmlFor="username">{t("auth.username")}</label>
          <input
            id="username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            disabled={isLoading}
            autoComplete="username"
            required
          />
        </div>

        <div className="field">
          <label htmlFor="password">{t("auth.password")}</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={isLoading}
            autoComplete="current-password"
            required
          />
        </div>

        <div className="form__actions">
          <button type="submit" disabled={isLoading} className="primary auth-primary">
            {isLoading ? `${t("auth.signIn")}...` : t("auth.signIn")}
          </button>
        </div>
      </form>

      <footer className="auth-footer">
        <p>
          {t("auth.dontHaveAccount")} <Link href="/register">{t("auth.createAccount")}</Link>
        </p>
      </footer>
    </div>
  );
}

interface TwoFAVerificationProps {
  userId: string;
  tempToken: string;
  method: string;
}

export function TwoFAVerification({ userId, tempToken, method }: TwoFAVerificationProps) {
  const router = useRouter();
  const { verify2FA } = useAuth();
  const t = useLocale();

  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [useRecoveryCode, setUseRecoveryCode] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      await verify2FA(userId, code, tempToken, useRecoveryCode);
      router.push("/dashboard");
    } catch (err) {
      const message = err instanceof Error ? err.message : t("auth.errors.serverError");
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="panel auth-card">
      <header className="auth-header">
        <p className="eyebrow">{t("app.name")}</p>
        <h2 className="auth-title">{t("twoFA.title")}</h2>
        <p className="auth-subtitle">
          {useRecoveryCode ? t("twoFA.enterRecoveryCode") : t("twoFA.enterCode")}
        </p>
      </header>

      {error && (
        <div className="auth-alert" role="alert">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="form">
        <div className="field">
          <label htmlFor="twofa-code">{useRecoveryCode ? t("twoFA.recoveryCode") : t("twoFA.verifyCode")}</label>
          <input
            id="twofa-code"
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^0-9A-Z\-]/g, ""))}
            disabled={isLoading}
            placeholder={useRecoveryCode ? t("twoFA.placeholders.recoveryCode") : t("twoFA.placeholders.totpCode")}
            inputMode={useRecoveryCode ? "text" : "numeric"}
            autoComplete="one-time-code"
            required
            className="auth-code"
          />
        </div>

        <div className="form__actions">
          <button type="submit" disabled={isLoading} className="primary auth-primary">
            {isLoading ? `${t("twoFA.verifyCode")}...` : t("twoFA.verifyCode")}
          </button>
        </div>
      </form>

      <button
        type="button"
        onClick={() => setUseRecoveryCode(!useRecoveryCode)}
        className="ghost auth-secondary"
      >
        {useRecoveryCode ? t("twoFA.enterTwoFACode") : t("twoFA.useRecoveryCode")}
      </button>
    </div>
  );
}
