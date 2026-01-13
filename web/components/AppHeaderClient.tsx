"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "../lib/i18n/I18nProvider";
import { useAuth } from "../lib/auth/AuthContext";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchAppSettings, updateMyProfile } from "@/lib/profile/client";

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

  const queryClient = useQueryClient();

  const themeMutation = useMutation({
    mutationFn: (mode: "light" | "dark" | "auto") => updateMyProfile({ themeMode: mode }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile", "me"] });
      refreshMe?.();
    },
  });

  const localeMutation = useMutation({
    mutationFn: (loc: "en" | "fr") => updateMyProfile({ preferredLocale: loc }),
    onSuccess: (data) => {
      if (data.preferredLocale) {
        setLocale(data.preferredLocale);
        queryClient.invalidateQueries({ queryKey: ["profile", "me"] });
        refreshMe?.();
      }
    },
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

  const toggleLocale = (newLocale: "en" | "fr") => {
    setLocale(newLocale);
    if (isAuthenticated) {
      localeMutation.mutate(newLocale);
    }
  };

  const setTheme = (mode: "light" | "dark" | "auto") => {
    themeMutation.mutate(mode);
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
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 10 }}><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" /></svg>
                  {t("pageTitles.settings")}
                </button>
                <button type="button" className="ghost user-menu__item" role="menuitem" onClick={() => goTo("/security")}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 10 }}><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                  {t("header.userMenu.security")}
                </button>

                <div className="user-menu__divider" role="separator" />

                <div className="user-menu__section-title">{t("header.theme")}</div>
                <div className="user-menu__toggles">
                  <button
                    type="button"
                    className={`user-menu__toggle ${user?.themeMode === "light" ? "active" : ""}`}
                    onClick={() => setTheme("light")}
                    title={t("header.lightMode")}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" /></svg>
                  </button>
                  <button
                    type="button"
                    className={`user-menu__toggle ${user?.themeMode === "dark" ? "active" : ""}`}
                    onClick={() => setTheme("dark")}
                    title={t("header.darkMode")}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>
                  </button>
                  <button
                    type="button"
                    className={`user-menu__toggle ${user?.themeMode === "auto" || !user?.themeMode ? "active" : ""}`}
                    onClick={() => setTheme("auto")}
                    title={t("header.autoMode")}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v2" /><path d="M12 20v2" /><path d="m4.93 4.93 1.41 1.41" /><path d="m17.66 17.66 1.41 1.41" /><path d="M2 12h2" /><path d="M20 12h2" /><path d="m6.34 17.66-1.41 1.41" /><path d="m19.07 4.93-1.41 1.41" /><circle cx="12" cy="12" r="4" /></svg>
                  </button>
                </div>

                <div className="user-menu__section-title">{t("header.language")}</div>
                <div className="user-menu__toggles">
                  <button
                    type="button"
                    className={`user-menu__toggle ${locale === "fr" ? "active" : ""}`}
                    onClick={() => toggleLocale("fr")}
                  >
                    <span style={{ fontSize: 12, fontWeight: 700 }}>FR</span>
                  </button>
                  <button
                    type="button"
                    className={`user-menu__toggle ${locale === "en" ? "active" : ""}`}
                    onClick={() => toggleLocale("en")}
                  >
                    <span style={{ fontSize: 12, fontWeight: 700 }}>EN</span>
                  </button>
                </div>

                <div className="user-menu__divider" role="separator" />
                <button type="button" className="ghost user-menu__item" role="menuitem" onClick={handleLogout}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 10 }}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
                  {t("auth.logout")}
                </button>
              </div>
            ) : null}
          </div>
        )}

      </div>
    </header>
  );
}
