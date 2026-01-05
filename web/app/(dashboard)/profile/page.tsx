"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "@/lib/i18n/I18nProvider";
import { useAuth } from "@/lib/auth/AuthContext";
import LoadingWine from "@/components/LoadingWine";
import {
  fetchAppSettings,
  fetchMyProfile,
  listUsers,
  testNotifications,
  updateAppSettings,
  updateMyProfile,
  updateUserRole,
  type AppSettings,
  type Profile,
  type UpdateProfileInput,
  type UserSummary,
} from "@/lib/profile/client";

type NotificationSettings = NonNullable<Profile["notificationSettings"]>;

const profileKey = ["profile", "me"] as const;
const usersKey = ["admin", "users"] as const;
const appSettingsKey = ["app-settings"] as const;

function getNotificationSettings(profile: Profile) {
  const raw = (profile.notificationSettings ?? {}) as Partial<NotificationSettings>;
  return {
    channels: raw.channels ?? {},
    categories: raw.categories ?? {},
    quietHours: raw.quietHours ?? {},
    webhookUrl: raw.webhookUrl ?? "",
    gotifyUrl: raw.gotifyUrl ?? "",
    locale: raw.locale ?? undefined,
  };
}

export default function ProfilePage() {
  const { t } = useTranslations();
  const { user, refreshMe } = useAuth();
  const queryClient = useQueryClient();

  const isAdmin = user?.role === "admin";

  const profileQuery = useQuery({
    queryKey: profileKey,
    queryFn: fetchMyProfile,
  });

  const appSettingsQuery = useQuery({
    queryKey: appSettingsKey,
    queryFn: fetchAppSettings,
    staleTime: 30_000,
  });

  const usersQuery = useQuery({
    queryKey: usersKey,
    queryFn: listUsers,
    enabled: isAdmin,
  });

  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const profile = profileQuery.data;

  const [draft, setDraft] = useState<UpdateProfileInput>({});

  const effective = useMemo(() => {
    if (!profile) return null;
    const settings = getNotificationSettings(profile);

    return {
      displayName: draft.displayName ?? profile.displayName,
      avatarUrl: draft.avatarUrl ?? profile.avatarUrl,
      tagline: draft.tagline ?? profile.tagline,
      preferredLocale: typeof draft.preferredLocale === "undefined" ? profile.preferredLocale : draft.preferredLocale,
      themeMode: draft.themeMode ?? profile.themeMode,
      accentColor: draft.accentColor ?? profile.accentColor,
      notificationSettings: draft.notificationSettings ?? settings,
    };
  }, [profile, draft]);

  const saveProfileMutation = useMutation({
    mutationFn: updateMyProfile,
    onMutate: async (input) => {
      setError(null);
      setFeedback(null);

      await queryClient.cancelQueries({ queryKey: profileKey });
      const previousProfile = queryClient.getQueryData<Profile>(profileKey);

      if (previousProfile) {
        const nextProfile: Profile = {
          ...previousProfile,
          ...input,
          notificationSettings:
            input.notificationSettings ? input.notificationSettings : previousProfile.notificationSettings,
        };
        queryClient.setQueryData(profileKey, nextProfile);
      }

      return { previousProfile };
    },
    onError: (_err, _input, ctx) => {
      if (ctx?.previousProfile) {
        queryClient.setQueryData(profileKey, ctx.previousProfile);
      }
      setError(t("errors.serverError"));
    },
    onSuccess: async () => {
      setFeedback(t("profile.saved"));
      setDraft({});
      await refreshMe();
      await queryClient.invalidateQueries({ queryKey: profileKey });
    },
  });

  const testNotifMutation = useMutation({
    mutationFn: testNotifications,
    onMutate: () => {
      setError(null);
      setFeedback(null);
    },
    onSuccess: (data) => {
      const webhook = data.results.webhook;
      const gotify = data.results.gotify;

      const webhookStatus = webhook.attempted ? (webhook.ok ? t("notifications.testOk") : t("notifications.testFailed")) : t("notifications.notAttempted");
      const gotifyStatus = gotify.attempted ? (gotify.ok ? t("notifications.testOk") : t("notifications.testFailed")) : t("notifications.notAttempted");

      setFeedback(`${t("notifications.webhook")} : ${webhookStatus} • ${t("notifications.gotify")} : ${gotifyStatus}`);
    },
    onError: () => {
      setError(t("errors.serverError"));
    },
  });

  const saveBrandMutation = useMutation({
    mutationFn: updateAppSettings,
    onMutate: async (input) => {
      setError(null);
      setFeedback(null);
      await queryClient.cancelQueries({ queryKey: appSettingsKey });
      const previous = queryClient.getQueryData<AppSettings>(appSettingsKey);
      if (previous) {
        queryClient.setQueryData(appSettingsKey, { ...previous, ...input } as AppSettings);
      }
      return { previous };
    },
    onError: (_err, _input, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(appSettingsKey, ctx.previous);
      setError(t("errors.serverError"));
    },
    onSuccess: () => {
      setFeedback(t("admin.brandingSaved"));
      queryClient.invalidateQueries({ queryKey: appSettingsKey });
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: "admin" | "user" }) => updateUserRole(userId, role),
    onMutate: async ({ userId, role }) => {
      setError(null);
      setFeedback(null);
      await queryClient.cancelQueries({ queryKey: usersKey });
      const previous = queryClient.getQueryData<UserSummary[]>(usersKey);
      if (previous) {
        queryClient.setQueryData(
          usersKey,
          previous.map((u) => (u.id === userId ? { ...u, role } : u))
        );
      }
      return { previous };
    },
    onError: (_err, _input, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(usersKey, ctx.previous);
      setError(t("errors.serverError"));
    },
    onSuccess: () => {
      setFeedback(t("admin.roleUpdated"));
      queryClient.invalidateQueries({ queryKey: usersKey });
    },
  });

  if (profileQuery.isLoading || !profile) {
    return (
      <div className="dashboard">
        <LoadingWine />
      </div>
    );
  }

  const notif = effective ? (effective.notificationSettings as NotificationSettings) : null;

  return (
    <div className="dashboard">
      <div className="panel">
        <div className="panel__header">
          <div>
            <p className="eyebrow">{t("pageTitles.profile")}</p>
            <h2>{t("profile.title")}</h2>
            <p>{t("profile.subtitle")}</p>
          </div>
        </div>

        {error ? <div className="section" style={{ borderColor: "var(--danger)", color: "var(--text)" }}>{error}</div> : null}
        {feedback ? <div className="section">{feedback}</div> : null}

        <div className="form">
          <div className="section">
            <div className="section__title">{t("profile.identity")}</div>
            <div className="grid">
              <label className="field">
                {t("profile.displayName")}
                <input
                  value={(effective?.displayName ?? "") as string}
                  onChange={(e) => setDraft((d) => ({ ...d, displayName: e.target.value || null }))}
                  placeholder={t("profile.displayNamePlaceholder")}
                />
              </label>

              <label className="field">
                {t("profile.avatarUrl")}
                <input
                  value={(effective?.avatarUrl ?? "") as string}
                  onChange={(e) => setDraft((d) => ({ ...d, avatarUrl: e.target.value || null }))}
                  placeholder={t("profile.avatarUrlPlaceholder")}
                />
              </label>

              <label className="field" style={{ gridColumn: "1 / -1" }}>
                {t("profile.tagline")}
                <input
                  value={(effective?.tagline ?? "") as string}
                  onChange={(e) => setDraft((d) => ({ ...d, tagline: e.target.value || null }))}
                  placeholder={t("profile.taglinePlaceholder")}
                />
              </label>
            </div>
          </div>

          <div className="section">
            <div className="section__title">{t("profile.preferences")}</div>
            <div className="grid">
              <label className="field">
                {t("profile.language")}
                <select
                  value={effective?.preferredLocale ?? ""}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      preferredLocale: e.target.value === "" ? null : (e.target.value as "en" | "fr"),
                    }))
                  }
                >
                  <option value="">{t("profile.languageAuto")}</option>
                  <option value="en">English</option>
                  <option value="fr">Français</option>
                </select>
              </label>

              <label className="field">
                {t("profile.theme")}
                <select
                  value={effective?.themeMode ?? "dark"}
                  onChange={(e) => setDraft((d) => ({ ...d, themeMode: e.target.value as "dark" | "light" }))}
                >
                  <option value="dark">{t("header.darkMode")}</option>
                  <option value="light">{t("header.lightMode")}</option>
                </select>
              </label>

              <label className="field">
                {t("profile.accentColor")}
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    type="color"
                    value={effective?.accentColor ?? "#c5a059"}
                    onChange={(e) => setDraft((d) => ({ ...d, accentColor: e.target.value }))}
                    aria-label={t("profile.accentColor")}
                    style={{ height: 44, width: 48, padding: 0, borderRadius: "var(--radius)" }}
                  />
                  <input
                    value={effective?.accentColor ?? "#c5a059"}
                    onChange={(e) => setDraft((d) => ({ ...d, accentColor: e.target.value }))}
                    placeholder="#c5a059"
                  />
                </div>
              </label>
            </div>
          </div>

          <div className="section">
            <div className="section__title">{t("notifications.title")}</div>
            <p className="section__hint">{t("notifications.subtitle")}</p>

            <div className="grid">
              <label className="field">
                {t("notifications.webhookUrl")}
                <input
                  value={(notif?.webhookUrl as string) ?? ""}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      notificationSettings: { ...notif, webhookUrl: e.target.value },
                    }))
                  }
                  placeholder="https://..."
                />
              </label>

              <label className="field">
                {t("notifications.gotifyUrl")}
                <input
                  value={(notif?.gotifyUrl as string) ?? ""}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      notificationSettings: { ...notif, gotifyUrl: e.target.value },
                    }))
                  }
                  placeholder="https://..."
                />
              </label>

              <div className="field">
                {t("notifications.channels")}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                  {(["email", "inApp", "webhook", "gotify"] as const).map((channel) => (
                    <label key={channel} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <input
                        type="checkbox"
                        checked={!!(notif?.channels as Record<string, unknown>)?.[channel]}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            notificationSettings: {
                              ...notif,
                              channels: { ...(notif.channels as Record<string, unknown>), [channel]: e.target.checked },
                            },
                          }))
                        }
                      />
                      {t(`notifications.channel.${channel}`)}
                    </label>
                  ))}
                </div>
              </div>

              <div className="field" style={{ gridColumn: "1 / -1" }}>
                {t("notifications.categories")}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                  {([
                    ["peakMaturity", "notifications.category.peakMaturity"],
                    ["climate", "notifications.category.climate"],
                    ["plannedConsumption", "notifications.category.plannedConsumption"],
                    ["sharing", "notifications.category.sharing"],
                  ] as const).map(([key, label]) => (
                    <label key={key} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <input
                        type="checkbox"
                        checked={!!(notif?.categories as Record<string, unknown>)?.[key]}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            notificationSettings: {
                              ...notif,
                              categories: { ...(notif.categories as Record<string, unknown>), [key]: e.target.checked },
                            },
                          }))
                        }
                      />
                      {t(label)}
                    </label>
                  ))}
                </div>
              </div>

              <div className="field" style={{ gridColumn: "1 / -1" }}>
                {t("notifications.quietHours")}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input
                      type="checkbox"
                      checked={!!(notif?.quietHours as Record<string, unknown>)?.enabled}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          notificationSettings: {
                            ...notif,
                            quietHours: { ...(notif.quietHours as Record<string, unknown>), enabled: e.target.checked },
                          },
                        }))
                      }
                    />
                    {t("notifications.enabled")}
                  </label>

                  <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {t("notifications.start")}
                    <input
                      type="time"
                      value={(notif?.quietHours as Record<string, unknown>)?.start as string ?? ""}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          notificationSettings: {
                            ...notif,
                            quietHours: { ...(notif.quietHours as Record<string, unknown>), start: e.target.value },
                          },
                        }))
                      }
                    />
                  </label>

                  <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {t("notifications.end")}
                    <input
                      type="time"
                      value={(notif?.quietHours as Record<string, unknown>)?.end as string ?? ""}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          notificationSettings: {
                            ...notif,
                            quietHours: { ...(notif.quietHours as Record<string, unknown>), end: e.target.value },
                          },
                        }))
                      }
                    />
                  </label>
                </div>
              </div>
            </div>

            <div className="form__actions">
              <button
                type="button"
                className="ghost"
                onClick={() => testNotifMutation.mutate()}
                disabled={testNotifMutation.isPending}
              >
                {t("notifications.sendTest")}
              </button>
            </div>
          </div>

          <div className="form__actions">
            <button
              type="button"
              className="primary"
              onClick={() => saveProfileMutation.mutate(draft)}
              disabled={saveProfileMutation.isPending}
            >
              {t("profile.save")}
            </button>
            <button type="button" onClick={() => setDraft({})} disabled={saveProfileMutation.isPending}>
              {t("actions.reset")}
            </button>
          </div>
        </div>
      </div>

      {isAdmin ? (
        <div className="panel">
          <div className="panel__header">
            <div>
              <p className="eyebrow">{t("admin.title")}</p>
              <h2>{t("admin.subtitle")}</h2>
            </div>
          </div>

          <div className="form">
            <div className="section">
              <div className="section__title">{t("admin.branding")}</div>
              <div className="grid">
                <label className="field">
                  {t("admin.appName")}
                  <input
                    value={appSettingsQuery.data?.appName ?? ""}
                    onChange={(e) =>
                      queryClient.setQueryData<AppSettings | undefined>(appSettingsKey, (prev) => {
                        const base =
                          prev ??
                          ({
                            appName: null,
                            appTagline: null,
                            logoUrl: null,
                            updatedAt: new Date().toISOString(),
                          } satisfies AppSettings);
                        return { ...base, appName: e.target.value || null };
                      })
                    }
                  />
                </label>

                <label className="field">
                  {t("admin.appTagline")}
                  <input
                    value={appSettingsQuery.data?.appTagline ?? ""}
                    onChange={(e) =>
                      queryClient.setQueryData<AppSettings | undefined>(appSettingsKey, (prev) => {
                        const base =
                          prev ??
                          ({
                            appName: null,
                            appTagline: null,
                            logoUrl: null,
                            updatedAt: new Date().toISOString(),
                          } satisfies AppSettings);
                        return { ...base, appTagline: e.target.value || null };
                      })
                    }
                  />
                </label>

                <label className="field" style={{ gridColumn: "1 / -1" }}>
                  {t("admin.logoUrl")}
                  <input
                    value={appSettingsQuery.data?.logoUrl ?? ""}
                    onChange={(e) =>
                      queryClient.setQueryData<AppSettings | undefined>(appSettingsKey, (prev) => {
                        const base =
                          prev ??
                          ({
                            appName: null,
                            appTagline: null,
                            logoUrl: null,
                            updatedAt: new Date().toISOString(),
                          } satisfies AppSettings);
                        return { ...base, logoUrl: e.target.value || null };
                      })
                    }
                    placeholder="https://..."
                  />
                </label>
              </div>

              <div className="form__actions">
                <button
                  type="button"
                  className="primary"
                  onClick={() =>
                    saveBrandMutation.mutate({
                      appName: appSettingsQuery.data?.appName ?? null,
                      appTagline: appSettingsQuery.data?.appTagline ?? null,
                      logoUrl: appSettingsQuery.data?.logoUrl ?? null,
                    })
                  }
                  disabled={saveBrandMutation.isPending}
                >
                  {t("admin.saveBranding")}
                </button>
              </div>
            </div>

            <div className="section">
              <div className="section__title">{t("admin.users")}</div>
              {usersQuery.isLoading ? (
                <p>{t("list.loading")}</p>
              ) : usersQuery.data && usersQuery.data.length ? (
                <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
                  {usersQuery.data.map((u) => (
                    <div key={u.id} className="section">
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                        <div>
                          <div style={{ color: "var(--text)", fontWeight: 600 }}>
                            {u.displayName || u.username}
                          </div>
                          <div style={{ fontSize: 12 }}>{u.email}</div>
                        </div>

                        <label className="field" style={{ minWidth: 140 }}>
                          <select
                            value={u.role}
                            onChange={(e) => updateRoleMutation.mutate({ userId: u.id, role: e.target.value as UserSummary["role"] })}
                          >
                            <option value="admin">{t("roles.admin")}</option>
                            <option value="user">{t("roles.user")}</option>
                          </select>
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p>{t("admin.noUsers")}</p>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
