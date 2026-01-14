type ProfileNotificationSettings = {
  channels?: {
    email?: boolean;
    inApp?: boolean;
    webhook?: boolean;
    gotify?: boolean;
  };
  categories?: {
    peakMaturity?: boolean;
    climate?: boolean;
    plannedConsumption?: boolean;
    sharing?: boolean;
  };
  quietHours?: {
    enabled?: boolean;
    start?: string;
    end?: string;
  };
  locale?: "en" | "fr";
  webhookUrl?: string;
  gotifyUrl?: string;
};

export type Profile = {
  id: string;
  username: string;
  email: string;
  role: "admin" | "user";
  displayName: string | null;
  avatarUrl: string | null;
  tagline: string | null;
  preferredLocale: "en" | "fr" | null;
  dateTimeFormat: "system" | "24h" | "12h";
  temperatureUnit: "c" | "f";
  themeMode: "dark" | "light" | "auto";
  accentColor: string;
  notificationSettings: Record<string, unknown>;
  aiApiKey?: string | null;
};

export type UpdateProfileInput = Partial<{
  displayName: string | null;
  avatarUrl: string | null;
  tagline: string | null;
  preferredLocale: "en" | "fr" | null;
  dateTimeFormat: "system" | "24h" | "12h";
  temperatureUnit: "c" | "f";
  themeMode: "dark" | "light" | "auto";
  accentColor: string;
  notificationSettings: ProfileNotificationSettings;
  aiApiKey?: string | null;
}>;

export type AppSettings = {
  appName: string | null;
  appTagline: string | null;
  logoUrl: string | null;
  smtpHost?: string | null;
  smtpPort?: number | null;
  smtpUser?: string | null;
  smtpPass?: string | null;
  smtpFrom?: string | null;
  smtpSecure?: boolean | null;
  updatedAt: string;
};

export type UserSummary = {
  id: string;
  username: string;
  email: string;
  role: "admin" | "user";
  displayName: string | null;
  createdAt: string;
};

export type UpdateUserInput = Partial<{
  role: "admin" | "user";
  displayName: string | null;
  email: string;
  username: string;
}>;

const headers = { "Content-Type": "application/json" };

const handleResponse = async (response: Response) => {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = (payload as { error?: string }).error ?? "UNKNOWN_ERROR";
    throw new Error(error);
  }
  return (payload as { data: unknown }).data;
};

export async function fetchMyProfile(): Promise<Profile> {
  const res = await fetch("/api/profile/me", { credentials: "include", cache: "no-store" });
  return (await handleResponse(res)) as Profile;
}

export async function updateMyProfile(input: UpdateProfileInput): Promise<Profile> {
  const res = await fetch("/api/profile/me", {
    method: "PATCH",
    headers,
    body: JSON.stringify(input),
    credentials: "include",
  });
  return (await handleResponse(res)) as Profile;
}

export async function testNotifications(): Promise<{ results: Record<string, { attempted: boolean; ok?: boolean; error?: string }> }> {
  const res = await fetch("/api/profile/notifications/test", {
    method: "POST",
    credentials: "include",
  });
  return (await handleResponse(res)) as { results: Record<string, { attempted: boolean; ok?: boolean; error?: string }> };
}

export async function fetchAppSettings(): Promise<AppSettings> {
  const res = await fetch("/api/profile/app-settings", { cache: "no-store" });
  return (await handleResponse(res)) as AppSettings;
}

export async function updateAppSettings(input: Partial<Omit<AppSettings, "updatedAt">>): Promise<AppSettings> {
  const res = await fetch("/api/admin/app-settings", {
    method: "PATCH",
    headers,
    body: JSON.stringify(input),
    credentials: "include",
  });
  return (await handleResponse(res)) as AppSettings;
}

export async function listUsers(): Promise<UserSummary[]> {
  const res = await fetch("/api/admin/users", { credentials: "include", cache: "no-store" });
  return (await handleResponse(res)) as UserSummary[];
}

export async function updateUserRole(userId: string, role: "admin" | "user"): Promise<void> {
  const res = await fetch(`/api/admin/users/${userId}/role`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ role }),
    credentials: "include",
  });
  await handleResponse(res);
}

export async function updateUser(userId: string, input: UpdateUserInput): Promise<void> {
  const res = await fetch(`/api/admin/users/${userId}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(input),
    credentials: "include",
  });
  await handleResponse(res);
}

export async function deleteUser(userId: string): Promise<void> {
  const res = await fetch(`/api/admin/users/${userId}`, {
    method: "DELETE",
    credentials: "include",
  });
  await handleResponse(res);
}

export async function createUser(input: { username: string; email: string; password?: string }): Promise<UserSummary> {
  const res = await fetch("/api/admin/users", {
    method: "POST",
    headers,
    body: JSON.stringify(input),
    credentials: "include",
  });
  return (await handleResponse(res)) as UserSummary;
}
