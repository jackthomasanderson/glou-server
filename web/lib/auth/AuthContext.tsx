import { createContext, useContext, useReducer, useEffect, ReactNode, useCallback } from "react";

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  role?: "admin" | "user";
  displayName?: string | null;
  avatarUrl?: string | null;
  tagline?: string | null;
  preferredLocale?: "en" | "fr" | null;
  dateTimeFormat?: "system" | "24h" | "12h";
  temperatureUnit?: "c" | "f";
  themeMode?: "dark" | "light" | "auto";
  accentColor?: string;
  twoFAEnabled: boolean;
  twoFAMethod?: "totp" | "webauthn";
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

type LoginChallengeResult = {
  requiresTwoFA: true;
  userId: string;
  tempToken: string;
  twoFAMethod: string;
};

type LoginSuccessResult = {
  user: AuthUser;
  tokens: AuthTokens;
};

export type LoginResult = LoginChallengeResult | LoginSuccessResult;

async function readJsonOrText<T = unknown>(response: Response): Promise<T | { error?: string } | null> {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.toLowerCase().includes("application/json")) {
    return response.json();
  }
  const text = await response.text();
  return text ? { error: text } : null;
}

interface AuthContextType {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: (username: string, password: string, rememberMe?: boolean) => Promise<LoginResult>;
  register: (username: string, email: string, password: string) => Promise<void>;
  verify2FA: (userId: string, code: string, tempToken: string, isRecoveryCode?: boolean, rememberMe?: boolean) => Promise<LoginSuccessResult>;
  refreshMe: () => Promise<AuthUser | null>;
  logout: () => Promise<void>;
  clearError: () => void;
}

interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  error: string | null;
}

type AuthAction =
  | { type: "SET_LOADING"; payload: boolean }
  | { type: "SET_ERROR"; payload: string | null }
  | { type: "SET_USER"; payload: AuthUser }
  | { type: "CLEAR_AUTH" };

const initialState: AuthState = {
  user: null,
  isLoading: true,
  error: null,
};

function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case "SET_LOADING":
      return { ...state, isLoading: action.payload };
    case "SET_ERROR":
      return { ...state, error: action.payload };
    case "SET_USER":
      return { ...state, user: action.payload, error: null };
    case "CLEAR_AUTH":
      return { ...initialState, isLoading: false };
    default:
      return state;
  }
}

// Token management
const TOKEN_KEY = "glou_access_token";
const REFRESH_TOKEN_KEY = "glou_refresh_token";

function getAccessToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

function setTokens(tokens: AuthTokens): void {
  localStorage.setItem(TOKEN_KEY, tokens.accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
}

function clearTokens(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

// API helper with automatic token refresh
async function fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
  const accessToken = getAccessToken();

  const headers = new Headers(options.headers);
  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  let response = await fetch(url, {
    ...options,
    headers,
  });

  // If 401, try to refresh token
  if (response.status === 401 && getRefreshToken()) {
    const refreshToken = getRefreshToken();
    if (refreshToken) {
      try {
        const refreshResponse = await fetch("/api/auth/refresh", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken }),
        });

        if (refreshResponse.ok) {
          const { accessToken: newAccessToken, refreshToken: newRefreshToken } = await refreshResponse.json();
          setTokens({ accessToken: newAccessToken, refreshToken: newRefreshToken });

          // Retry original request with new token
          headers.set("Authorization", `Bearer ${newAccessToken}`);
          response = await fetch(url, {
            ...options,
            headers,
          });
        } else {
          // Refresh failed, clear tokens
          clearTokens();
        }
      } catch (error) {
        console.error("Token refresh failed:", error);
        clearTokens();
      }
    }
  }

  return response;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(authReducer, initialState);

  const refreshMe = useCallback(async (): Promise<AuthUser | null> => {
    try {
      const response = await fetchWithAuth("/api/profile/me");
      if (!response.ok) {
        dispatch({ type: "CLEAR_AUTH" });
        clearTokens();
        return null;
      }

      const { data } = await response.json();
      dispatch({ type: "SET_USER", payload: data });
      return data as AuthUser;
    } catch {
      dispatch({ type: "CLEAR_AUTH" });
      clearTokens();
      return null;
    }
  }, []);

  // Initialize auth from token on mount
  useEffect(() => {
    const initializeAuth = async () => {
      dispatch({ type: "SET_LOADING", payload: true });

      // Check if we have a token
      if (!getAccessToken()) {
        dispatch({ type: "CLEAR_AUTH" });
        return;
      }

      try {
        await refreshMe();
        dispatch({ type: "SET_LOADING", payload: false });
      } catch {
        dispatch({ type: "CLEAR_AUTH" });
      }
    };

    initializeAuth();
  }, [refreshMe]);

  const login = useCallback(async (username: string, password: string, rememberMe?: boolean) => {
    dispatch({ type: "SET_LOADING", payload: true });
    dispatch({ type: "SET_ERROR", payload: null });

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, rememberMe }),
      });

      const result = await readJsonOrText<{ error?: string } | { user?: AuthUser; tokens?: AuthTokens; requires2FA?: boolean; userId?: string; tempToken?: string; twoFAMethod?: string }>(response);

      if (!response.ok) {
        throw new Error((result as { error?: string })?.error || "Login failed");
      }

      if ((result as { requires2FA?: boolean })?.requires2FA) {
        dispatch({ type: "SET_LOADING", payload: false });

        const challenge: LoginChallengeResult = {
          requiresTwoFA: true,
          userId: String((result as { userId?: string })?.userId),
          tempToken: String((result as { tempToken?: string })?.tempToken),
          twoFAMethod: String((result as { twoFAMethod?: string })?.twoFAMethod),
        };

        return challenge;
      }

      const tokens = (result as { tokens?: AuthTokens })?.tokens;
      const user = (result as { user?: AuthUser })?.user;

      if (!tokens?.accessToken || !tokens?.refreshToken || !user) {
        throw new Error("Login failed - invalid response");
      }

      setTokens(tokens);
      dispatch({ type: "SET_USER", payload: user });
      dispatch({ type: "SET_LOADING", payload: false });

      const success: LoginSuccessResult = { user, tokens };
      return success;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Login failed";
      dispatch({ type: "SET_ERROR", payload: message });
      dispatch({ type: "SET_LOADING", payload: false });
      throw error;
    }
  }, []);

  const register = useCallback(async (username: string, email: string, password: string) => {
    dispatch({ type: "SET_LOADING", payload: true });
    dispatch({ type: "SET_ERROR", payload: null });

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, email, password }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Registration failed");
      }

      // Auto-login after registration
      const tokens = result.tokens;
      const user = result.user;

      if (tokens?.accessToken && tokens?.refreshToken && user) {
        setTokens(tokens);
        dispatch({ type: "SET_USER", payload: user });
      }

      dispatch({ type: "SET_LOADING", payload: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Registration failed";
      dispatch({ type: "SET_ERROR", payload: message });
      dispatch({ type: "SET_LOADING", payload: false });
      throw error;
    }
  }, []);

  const verify2FA = useCallback(async (userId: string, code: string, tempToken: string, isRecoveryCode: boolean = false, rememberMe?: boolean) => {
    dispatch({ type: "SET_LOADING", payload: true });
    dispatch({ type: "SET_ERROR", payload: null });

    try {
      const response = await fetch("/api/auth/verify-2fa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          tempToken,
          rememberMe,
          ...(isRecoveryCode ? { recoveryCode: code } : { code }),
        }),
      });

      const result = await readJsonOrText<{ error?: string } | { user?: AuthUser; tokens?: AuthTokens }>(response);

      if (!response.ok) {
        throw new Error((result as { error?: string })?.error || "2FA verification failed");
      }

      // Backend returns { data: { tokens: ..., user: ... } } (check auth.ts structure)
      // Actually verify-2fa returns { data: { accessToken, refreshToken, userId, ... } }
      // So result is { data: { ... } }

      const data = (result as { data?: any })?.data;
      // In verify-2fa, tokens are spread in data, not nested in a 'tokens' object
      // wait, let's verify auth.ts again.
      // res.json({ data: { accessToken: ..., refreshToken: ..., userId: ... } });

      const tokens = data ? { accessToken: data.accessToken, refreshToken: data.refreshToken } : undefined;
      const user = data ? {
        id: data.userId,
        username: data.username,
        email: data.email,
        role: data.role,
        twoFAEnabled: true
      } : undefined;

      if (!tokens?.accessToken || !tokens?.refreshToken || !user) {
        throw new Error("2FA verification failed - invalid response");
      }

      setTokens(tokens);
      dispatch({ type: "SET_USER", payload: user });
      dispatch({ type: "SET_LOADING", payload: false });

      const success: LoginSuccessResult = { user, tokens };
      return success;
    } catch (error) {
      const message = error instanceof Error ? error.message : "2FA verification failed";
      dispatch({ type: "SET_ERROR", payload: message });
      dispatch({ type: "SET_LOADING", payload: false });
      throw error;
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      // JWT logout is client-side only
      clearTokens();
    } catch (error) {
      console.error("Logout error:", error);
    }

    dispatch({ type: "CLEAR_AUTH" });
  }, []);

  const clearError = useCallback(() => {
    dispatch({ type: "SET_ERROR", payload: null });
  }, []);

  const value: AuthContextType = {
    user: state.user,
    isAuthenticated: state.user !== null,
    isLoading: state.isLoading,
    error: state.error,
    login,
    register,
    verify2FA,
    refreshMe,
    logout,
    clearError,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Hook to use auth context
 */
export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
