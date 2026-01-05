"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "../lib/i18n/I18nProvider";
import { useAuth } from "../lib/auth/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { fetchAppSettings } from "@/lib/profile/client";

export function AppHeaderClient() {
  const { t, locale, setLocale } = useTranslations();
  const { user, isAuthenticated, logout } = useAuth();
  const router = useRouter();
  const [isHydrated, setIsHydrated] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const { data: appSettings } = useQuery({
    queryKey: ["app-settings"],
    queryFn: fetchAppSettings,
    staleTime: 30_000,
  });

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (!isUserMenuOpen) return;

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (menuRef.current && !menuRef.current.contains(target)) {
        setIsUserMenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsUserMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isUserMenuOpen]);

  const toggleLocale = () => {
    setLocale(locale === "en" ? "fr" : "en");
  };

  if (!isHydrated) {
    return null; // Avoid hydration mismatch by rendering nothing on server
  }

  const avatarLabel = (user?.displayName?.trim()?.[0] || user?.username?.trim()?.[0] || "?").toUpperCase();

  const brandTitle = appSettings?.appName?.trim() || t("app.title");
  const brandSubtitle = appSettings?.appTagline?.trim() || t("app.subtitle");

  const handleLogout = async () => {
    setIsUserMenuOpen(false);
    await logout();
    // BYPASS POUR FEAT-01 : ne pas rediriger vers login
    // router.push("/login");
  };

  const isAdmin = user?.role === "admin";

  const goTo = (href: string) => {
    setIsUserMenuOpen(false);
    router.push(href);
  };

  return (
    <header className="app-header">
      <div className="app-header__brand">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {appSettings?.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={appSettings.logoUrl} alt={brandTitle} width={28} height={28} style={{ borderRadius: 6 }} />
          ) : null}
          <h1>{brandTitle}</h1>
        </div>
        <p className="eyebrow">{brandSubtitle}</p>
      </div>
      <div className="app-header__controls">
        {isAuthenticated && (
          <div className="user-menu" ref={menuRef}>
            <button
              type="button"
              className="ghost icon-button"
              onClick={() => setIsUserMenuOpen((v) => !v)}
              aria-label={t("header.userMenu.label")}
              aria-haspopup="menu"
              aria-expanded={isUserMenuOpen}
              title={t("header.userMenu.label")}
            >
              <span className="avatar-badge" aria-hidden="true">
                {avatarLabel}
              </span>
            </button>

            {isUserMenuOpen ? (
              <div className="user-menu__dropdown" role="menu" aria-label={t("header.userMenu.label")}
              >
                <button type="button" className="ghost user-menu__item" role="menuitem" onClick={() => goTo("/profile")}
                >
                  {t("header.userMenu.profile")}
                </button>
                <button type="button" className="ghost user-menu__item" role="menuitem" onClick={() => goTo("/security")}
                >
                  {t("header.userMenu.security")}
                </button>
                {isAdmin ? (
                  <button type="button" className="ghost user-menu__item" role="menuitem" onClick={() => goTo("/profile#admin")}
                  >
                    {t("header.userMenu.admin")}
                  </button>
                ) : null}
                <div className="user-menu__divider" role="separator" />
                <button type="button" className="ghost user-menu__item" role="menuitem" onClick={handleLogout}
                >
                  {t("auth.logout")}
                </button>
              </div>
            ) : null}
          </div>
        )}
        <button
          type="button"
          className="ghost icon-button"
          onClick={toggleLocale}
          aria-label={t("header.language")}
          aria-live="polite"
          aria-atomic="true"
          title={t("header.language")}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="12" cy="12" r="10" />
            <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
          </svg>
        </button>
      </div>
    </header>
  );
}
