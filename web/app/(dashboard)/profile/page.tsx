"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "@/lib/i18n/I18nProvider";
import { useAuth } from "@/lib/auth/AuthContext";
import LoadingWine from "@/components/LoadingWine";
import ImageUpload from "@/components/ImageUpload";
import {
  deleteUser,
  fetchAppSettings,
  fetchMyProfile,
  listUsers,
  testNotifications,
  updateAppSettings,
  updateMyProfile,
  updateUser,
  updateUserRole,
  createUser,
  type AppSettings,
  type Profile,
  type UpdateProfileInput,
  type UpdateUserInput,
  type UserSummary,
} from "@/lib/profile/client";
import { AdminAiApiKeyForm } from "@/components/AdminAiApiKeyForm";
import { AdminSmtpForm } from "@/components/AdminSmtpForm";
import { Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions, Button, TextField } from "@mui/material";

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
  const [activeTab, setActiveTab] = useState<"profile" | "admin">("profile");

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
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [userDraft, setUserDraft] = useState<UpdateUserInput>({});
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [newUserDraft, setNewUserDraft] = useState({ username: "", email: "", password: "" });

  const adminCount = usersQuery.data?.filter(u => u.role === "admin").length || 0;

  const [deleteConfirmation, setDeleteConfirmation] = useState<{ id: string; username: string } | null>(null);
  const [deleteInput, setDeleteInput] = useState("");

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
      aiApiKey: typeof draft.aiApiKey === "undefined" ? profile.aiApiKey : draft.aiApiKey,
    };
  }, [profile, draft]);

  const saveProfileMutation = useMutation({
    mutationFn: updateMyProfile,
    onMutate: async (input: UpdateProfileInput) => {
      setError(null);
      setFeedback(null);
      await queryClient.cancelQueries({ queryKey: profileKey });
      const previous = queryClient.getQueryData<Profile>(profileKey);
      if (previous) {
        queryClient.setQueryData(profileKey, { ...previous, ...input } as Profile);
      }
      return { previous };
    },
    onError: (_err, _input, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(profileKey, ctx.previous);
      setError(t("errors.serverError"));
    },
    onSuccess: () => {
      setFeedback(t("profile.saved"));
      queryClient.invalidateQueries({ queryKey: profileKey });
      refreshMe?.();
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

  const updateUserMutation = useMutation({
    mutationFn: ({ userId, draft }: { userId: string; draft: UpdateUserInput }) => updateUser(userId, draft),
    onMutate: async ({ userId, draft }) => {
      setError(null);
      setFeedback(null);
      await queryClient.cancelQueries({ queryKey: usersKey });
      const previous = queryClient.getQueryData<UserSummary[]>(usersKey);
      if (previous) {
        queryClient.setQueryData(
          usersKey,
          previous.map((u) => (u.id === userId ? { ...u, ...draft } : u))
        );
      }
      return { previous };
    },
    onError: (_err, _input, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(usersKey, ctx.previous);
      setError(t("errors.serverError"));
    },
    onSuccess: () => {
      setFeedback(t("admin.userUpdated"));
      queryClient.invalidateQueries({ queryKey: usersKey });
      setEditingUserId(null);
      setUserDraft({});
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: (userId: string) => deleteUser(userId),
    onMutate: async (userId) => {
      setError(null);
      setFeedback(null);
      await queryClient.cancelQueries({ queryKey: usersKey });
      const previous = queryClient.getQueryData<UserSummary[]>(usersKey);
      if (previous) {
        queryClient.setQueryData(
          usersKey,
          previous.filter((u) => u.id !== userId)
        );
      }
      return { previous };
    },
    onError: (err, _userId, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(usersKey, ctx.previous);
      setError(err instanceof Error ? err.message : t("errors.serverError"));
    },
    onSuccess: () => {
      setFeedback(t("admin.userDeleted"));
      queryClient.invalidateQueries({ queryKey: usersKey });
    },
  });

  const createUserMutation = useMutation({
    mutationFn: (input: { username: string; email: string; password?: string }) => createUser(input),
    onSuccess: () => {
      setFeedback(t("admin.userCreated"));
      queryClient.invalidateQueries({ queryKey: usersKey });
      setIsCreatingUser(false);
      setNewUserDraft({ username: "", email: "", password: "" });
    },
    onError: (err: any) => {
      setError(err.message || t("errors.serverError"));
    },
  });

  const testNotifMutation = useMutation({
    mutationFn: () => testNotifications(),
    onMutate: async () => {
      setError(null);
      setFeedback(null);
    },
    onError: () => {
      setError(t("errors.serverError"));
    },
    onSuccess: () => {
      setFeedback(t("notifications.testSent") ?? "Test sent");
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

  // Simple initial generator for default avatar
  const defaultAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(profile.displayName || profile.username)}&background=random&color=fff&size=512`;

  // Default logo generator (simplified wine icon placeholder)
  const defaultLogo = `data:image/svg+xml;base64,${btoa(`<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 24 24" fill="none" stroke="%237B1E30" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 2v6"/><path d="M15 2v6"/><rect x="6" y="8" width="12" height="14" rx="2"/></svg>`)}`;

  return (
    <div className="dashboard">
      <div className="panel">
        <div className="panel__header">
          <div>
            <p className="eyebrow">{t("pageTitles.settings")}</p>
            <h2>{t("pageTitles.settings")}</h2>
            <p>{t("profile.subtitle")}</p>
          </div>
        </div>

        {isAdmin && (
          <div className="tabs">
            <button
              className={`tab ${activeTab === "profile" ? "active" : ""}`}
              onClick={() => setActiveTab("profile")}
            >
              {t("header.userMenu.profile")}
            </button>
            <button
              className={`tab ${activeTab === "admin" ? "active" : ""}`}
              onClick={() => setActiveTab("admin")}
            >
              {t("header.userMenu.admin")}
            </button>
          </div>
        )}

        {error ? <div className="section" style={{ borderColor: "var(--danger)", color: "var(--text)", marginBottom: 16 }}>{error}</div> : null}
        {feedback ? <div className="section" style={{ borderColor: "var(--success)", marginBottom: 16 }}>{feedback}</div> : null}

        {activeTab === "profile" ? (
          <div className="form">
            <div className="section">
              <div className="section__title">{t("profile.identity")}</div>

              <div style={{ display: "flex", gap: 32, marginBottom: 24, flexWrap: "wrap", alignItems: "center" }}>
                <ImageUpload
                  label={t("profile.avatar")}
                  value={effective?.avatarUrl || null}
                  onChange={(url) => setDraft((d) => ({ ...d, avatarUrl: url }))}
                  shape="circle"
                  defaultImage={defaultAvatar}
                />
                <div style={{ flex: 1, minWidth: 280 }} className="grid">
                  <label className="field">
                    {t("profile.displayName")}
                    <input
                      value={(effective?.displayName ?? "") as string}
                      onChange={(e) => setDraft((d) => ({ ...d, displayName: e.target.value || null }))}
                      placeholder={t("profile.displayNamePlaceholder")}
                    />
                  </label>

                </div>
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
                    value={effective?.themeMode ?? "auto"}
                    onChange={(e) => setDraft((d) => ({ ...d, themeMode: e.target.value as "dark" | "light" | "auto" }))}
                  >
                    <option value="auto">{t("header.autoMode")}</option>
                    <option value="dark">{t("header.darkMode")}</option>
                    <option value="light">{t("header.lightMode")}</option>
                  </select>
                </label>

                <label className="field">
                  {t("profile.accentColor")}
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input
                      type="color"
                      value={effective?.accentColor ?? "#2563EB"}
                      onChange={(e) => setDraft((d) => ({ ...d, accentColor: e.target.value }))}
                      aria-label={t("profile.accentColor")}
                      style={{ height: 44, width: 48, padding: 0, borderRadius: "var(--radius)" }}
                    />
                    <input
                      value={effective?.accentColor ?? "#2563EB"}
                      onChange={(e) => setDraft((d) => ({ ...d, accentColor: e.target.value }))}
                      placeholder="#2563EB"
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
        ) : (
          <div className="form">
            <div className="section">
              <div className="section__title">{t("admin.branding")}</div>

              <div style={{ display: "flex", gap: 32, marginBottom: 24, flexWrap: "wrap", alignItems: "center" }}>
                <ImageUpload
                  label={t("admin.logo")}
                  value={appSettingsQuery.data?.logoUrl || null}
                  onChange={(url) =>
                    queryClient.setQueryData<AppSettings | undefined>(appSettingsKey, (prev) => {
                      const base = prev ?? { appName: null, appTagline: null, logoUrl: null, updatedAt: new Date().toISOString() };
                      return { ...base, logoUrl: url };
                    })
                  }
                  shape="square"
                  defaultImage={defaultLogo}
                />

                <div style={{ flex: 1, minWidth: 280 }} className="grid">
                  <label className="field">
                    {t("admin.appName")}
                    <input
                      value={appSettingsQuery.data?.appName ?? ""}
                      onChange={(e) =>
                        queryClient.setQueryData<AppSettings | undefined>(appSettingsKey, (prev) => {
                          const base = prev ?? { appName: null, appTagline: null, logoUrl: null, updatedAt: new Date().toISOString() };
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
                          const base = prev ?? { appName: null, appTagline: null, logoUrl: null, updatedAt: new Date().toISOString() };
                          return { ...base, appTagline: e.target.value || null };
                        })
                      }
                    />
                  </label>
                </div>
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

            <AdminSmtpForm />

            <div className="section">
              <div className="section__title">{t("admin.aiApiKey.title")}</div>
              <p className="section__hint">{t("admin.aiApiKey.intro")}</p>
              <AdminAiApiKeyForm />
            </div>

            <div className="section">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <div className="section__title" style={{ marginBottom: 0 }}>{t("admin.users")}</div>
                {!isCreatingUser && (
                  <button type="button" className="primary small" onClick={() => setIsCreatingUser(true)}>
                    {t("admin.createUser")}
                  </button>
                )}
              </div>

              {isCreatingUser && (
                <div className="section" style={{ background: "var(--bg-card)", marginBottom: 24 }}>
                  <div className="section__title">{t("admin.newUser")}</div>
                  <div className="grid">
                    <label className="field">
                      {t("fields.username")}
                      <input
                        value={newUserDraft.username}
                        onChange={(e) => setNewUserDraft((d) => ({ ...d, username: e.target.value }))}
                        placeholder="username"
                      />
                    </label>
                    <label className="field">
                      {t("fields.email")}
                      <input
                        value={newUserDraft.email}
                        onChange={(e) => setNewUserDraft((d) => ({ ...d, email: e.target.value }))}
                        placeholder="email@example.com"
                      />
                    </label>
                    <label className="field">
                      {t("auth.password")}
                      <input
                        type="password"
                        value={newUserDraft.password}
                        onChange={(e) => setNewUserDraft((d) => ({ ...d, password: e.target.value }))}
                        placeholder="******** (optional)"
                      />
                    </label>
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                    <button
                      type="button"
                      className="primary"
                      disabled={createUserMutation.isPending}
                      onClick={() => createUserMutation.mutate(newUserDraft)}
                    >
                      {t("actions.add")}
                    </button>
                    <button type="button" onClick={() => setIsCreatingUser(false)}>
                      {t("actions.cancel")}
                    </button>
                  </div>
                </div>
              )}

              {usersQuery.isLoading ? (
                <p>{t("list.loading")}</p>
              ) : usersQuery.data && usersQuery.data.length ? (
                <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
                  {usersQuery.data.map((u) => (
                    <div key={u.id} className="section" style={{ background: "var(--bg)", position: "relative" }}>
                      {editingUserId === u.id ? (
                        <div className="grid" style={{ gap: 12 }}>
                          <label className="field" style={{ marginBottom: 0 }}>
                            {t("profile.displayName")}
                            <input
                              value={userDraft.displayName ?? u.displayName ?? ""}
                              onChange={(e) => setUserDraft((d) => ({ ...d, displayName: e.target.value || null }))}
                              placeholder={t("profile.displayNamePlaceholder")}
                            />
                          </label>
                          <label className="field" style={{ marginBottom: 0 }}>
                            {t("fields.email")}
                            <input
                              value={userDraft.email ?? u.email ?? ""}
                              onChange={(e) => setUserDraft((d) => ({ ...d, email: e.target.value }))}
                              placeholder="email@example.com"
                            />
                          </label>
                          <label className="field" style={{ marginBottom: 0 }}>
                            {t("fields.username")}
                            <input
                              value={userDraft.username ?? u.username ?? ""}
                              onChange={(e) => setUserDraft((d) => ({ ...d, username: e.target.value }))}
                              placeholder="username"
                            />
                          </label>
                          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                            <button
                              type="button"
                              className="primary small"
                              onClick={() => updateUserMutation.mutate({ userId: u.id, draft: userDraft })}
                              disabled={updateUserMutation.isPending}
                            >
                              {t("actions.save")}
                            </button>
                            <button
                              type="button"
                              className="ghost small"
                              onClick={() => {
                                setEditingUserId(null);
                                setUserDraft({});
                              }}
                            >
                              {t("actions.cancel")}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                              <div style={{ color: "var(--text)", fontWeight: 600, wordBreak: "break-word" }}>
                                {u.displayName || u.username}
                              </div>
                              <span style={{ fontSize: 10, opacity: 0.6, background: "var(--bg-card)", padding: "2px 6px", borderRadius: 4, wordBreak: "break-all" }}>
                                {u.username}
                              </span>
                            </div>
                            <div style={{ fontSize: 12, opacity: 0.8, wordBreak: "break-word" }}>{u.email}</div>
                            <div style={{ fontSize: 10, marginTop: 4, opacity: 0.5 }}>
                              {new Date(u.createdAt).toLocaleDateString()}
                            </div>
                          </div>

                          <div style={{ display: "flex", gap: 12, alignItems: "center", flexShrink: 0 }}>
                            <label className="field" style={{ minWidth: 120, marginBottom: 0 }}>
                              <select
                                value={u.role}
                                style={{ height: 36, fontSize: 13 }}
                                onChange={(e) => updateRoleMutation.mutate({ userId: u.id, role: e.target.value as UserSummary["role"] })}
                              >
                                <option value="admin">{t("roles.admin")}</option>
                                <option value="user">{t("roles.user")}</option>
                              </select>
                            </label>

                            <button
                              type="button"
                              className="ghost"
                              style={{ padding: "8px", height: 36, width: 36, display: "flex", alignItems: "center", justifyContent: "center" }}
                              onClick={() => {
                                setEditingUserId(u.id);
                                setUserDraft({
                                  displayName: u.displayName,
                                  email: u.email,
                                  username: u.username,
                                });
                              }}
                              title={t("admin.editUser")}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                            </button>

                            {u.id !== user?.id && !(u.role === "admin" && adminCount <= 1) && (
                              <button
                                type="button"
                                className="ghost"
                                style={{ color: "var(--danger)", padding: "8px", height: 36, width: 36, display: "flex", alignItems: "center", justifyContent: "center" }}
                                onClick={() => {
                                  setDeleteConfirmation({ id: u.id, username: u.username });
                                  setDeleteInput("");
                                }}
                                title={t("admin.deleteUser")}
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" /></svg>
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p>{t("admin.noUsers")}</p>
              )}
            </div>

            {/* Delete Confirmation Dialog */}
            <Dialog
              open={!!deleteConfirmation}
              onClose={() => setDeleteConfirmation(null)}
              disableEnforceFocus
            >
              <DialogTitle>{t("admin.deleteUser")}</DialogTitle>
              <DialogContent>
                <DialogContentText>
                  {t("admin.deleteWarning", { username: deleteConfirmation?.username }) || `This action cannot be undone. Please type "${deleteConfirmation?.username}" to confirm.`}
                </DialogContentText>
                <TextField
                  autoFocus
                  margin="dense"
                  label={t("fields.username") || "Username"}
                  fullWidth
                  variant="outlined"
                  value={deleteInput}
                  onChange={(e) => setDeleteInput(e.target.value)}
                  placeholder={deleteConfirmation?.username}
                />
              </DialogContent>
              <DialogActions>
                <Button onClick={() => setDeleteConfirmation(null)} color="inherit">
                  {t("actions.cancel")}
                </Button>
                <Button
                  onClick={() => {
                    if (deleteConfirmation && deleteInput === deleteConfirmation.username) {
                      deleteUserMutation.mutate(deleteConfirmation.id);
                      setDeleteConfirmation(null);
                    }
                  }}
                  color="error"
                  variant="contained"
                  disabled={!deleteConfirmation || deleteInput !== deleteConfirmation.username}
                >
                  {t("actions.delete")}
                </Button>
              </DialogActions>
            </Dialog>
          </div>
        )}
      </div>
    </div>
  );
}
