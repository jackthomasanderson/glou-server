"use client";

import { useState, FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthContext";
import { useLocale } from "@/lib/i18n/I18nProvider";

export function RegisterForm() {
  const router = useRouter();
  const { register } = useAuth();
  const t = useLocale();

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const validateForm = (): string | null => {
    if (!username || !email || !password || !confirmPassword) {
      return t("auth.errors.required");
    }
    if (password.length < 12) {
      return t("auth.passwordTooShort");
    }
    if (password !== confirmPassword) {
      return t("auth.passwordsMismatch");
    }
    return null;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsLoading(true);

    try {
      await register(username, email, password);
      // After successful registration, redirect to login
      router.push("/login?registered=true");
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
        <h1 className="auth-title">{t("auth.registerTitle")}</h1>
        <p className="auth-subtitle">{t("auth.registerSubtitle")}</p>
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
          <label htmlFor="email">{t("auth.email")}</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={isLoading}
            autoComplete="email"
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
            autoComplete="new-password"
            required
          />
          <p className="auth-hint">{t("auth.passwordHint")}</p>
        </div>

        <div className="field">
          <label htmlFor="confirmPassword">{t("auth.confirmPassword")}</label>
          <input
            id="confirmPassword"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            disabled={isLoading}
            autoComplete="new-password"
            required
          />
        </div>

        <div className="form__actions">
          <button type="submit" disabled={isLoading} className="primary auth-primary">
            {isLoading ? `${t("auth.createAccount")}...` : t("auth.createAccount")}
          </button>
        </div>
      </form>

      <footer className="auth-footer">
        <p>
          {t("auth.alreadyHaveAccount")} <Link href="/login">{t("auth.login")}</Link>
        </p>
      </footer>
    </div>
  );
}
