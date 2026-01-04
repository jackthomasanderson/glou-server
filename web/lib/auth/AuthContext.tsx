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
  themeMode?: "dark" | "light";
  accentColor?: string;
  twoFAEnabled: boolean;
  twoFAMethod?: "totp" | "webauthn";
}

export interface AuthSession {
  id: string;
  sessionToken: string;
}

type LoginChallengeResult = {
  requiresTwoFA: true;
  userId: string;
  tempToken: string;
  twoFAMethod: string;
};

type LoginSuccessResult = {
  user: AuthUser;
  session: AuthSession;
};

export type LoginResult = LoginChallengeResult | LoginSuccessResult;

async function readJsonOrText(response: Response): Promise<any> {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.toLowerCase().includes("application/json")) {
    return response.json();
  }
  const text = await response.text();
  return text ? { error: text } : null;
}

interface AuthContextType {
  user: AuthUser | null;
  session: AuthSession | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: (username: string, password: string) => Promise<LoginResult>;
  register: (username: string, email: string, password: string) => Promise<void>;
  verify2FA: (userId: string, code: string, tempToken: string, isRecoveryCode?: boolean) => Promise<LoginSuccessResult>;
  refreshMe: () => Promise<AuthUser | null>;
  logout: () => Promise<void>;
  clearError: () => void;
}

interface AuthState {
  user: AuthUser | null;
  session: AuthSession | null;
  isLoading: boolean;
  error: string | null;
}

type AuthAction =
  | { type: "SET_LOADING"; payload: boolean }
  | { type: "SET_ERROR"; payload: string | null }
  | { type: "SET_USER"; payload: AuthUser }
  | { type: "SET_SESSION"; payload: AuthSession }
  | { type: "CLEAR_AUTH" };

const initialState: AuthState = {
  user: null,
  session: null,
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
    case "SET_SESSION":
      return { ...state, session: action.payload };
    case "CLEAR_AUTH":
      return { ...initialState, isLoading: false };
    default:
      return state;
  }
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(authReducer, initialState);

  const refreshMe = useCallback(async (): Promise<AuthUser | null> => {
    try {
      const response = await fetch("/api/auth/me", { credentials: "include" });
      if (!response.ok) {
        dispatch({ type: "CLEAR_AUTH" });
        return null;
      }

      const { data } = await response.json();
      dispatch({ type: "SET_USER", payload: data });
      return data as AuthUser;
    } catch {
      dispatch({ type: "CLEAR_AUTH" });
      return null;
    }
  }, []);

  // Initialize auth from session on mount
  useEffect(() => {
    const initializeAuth = async () => {
      dispatch({ type: "SET_LOADING", payload: true });
      try {
        await refreshMe();
      } catch (error) {
        dispatch({ type: "CLEAR_AUTH" });
      } finally {
        dispatch({ type: "SET_LOADING", payload: false });
      }
    };

    initializeAuth();
  }, [refreshMe]);

  const login = useCallback(async (username: string, password: string) => {
    dispatch({ type: "SET_LOADING", payload: true });
    dispatch({ type: "SET_ERROR", payload: null });

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
        credentials: "include",
      });

      const result = await readJsonOrText(response);

      if (!response.ok) {
        throw new Error(result?.error || "Login failed");
      }

      if (result?.requiresTwoFA) {
        dispatch({ type: "SET_LOADING", payload: false });

        const challenge: LoginChallengeResult = {
          requiresTwoFA: true,
          userId: String(result.userId),
          tempToken: String(result.tempToken),
          twoFAMethod: String(result.twoFAMethod),
        };

        return challenge;
      }

      const data = result?.data;
      if (!data?.sessionId || !data?.sessionToken) {
        throw new Error("Login failed");
      }

      const session: AuthSession = {
        id: data.sessionId,
        sessionToken: data.sessionToken,
      };

      const me = await refreshMe();
      if (!me?.id) {
        throw new Error("Login succeeded but session initialization failed");
      }
      dispatch({ type: "SET_SESSION", payload: session });
      dispatch({ type: "SET_LOADING", payload: false });

      const success: LoginSuccessResult = { user: me, session };
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
        credentials: "include",
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Registration failed");
      }

      dispatch({ type: "SET_LOADING", payload: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Registration failed";
      dispatch({ type: "SET_ERROR", payload: message });
      dispatch({ type: "SET_LOADING", payload: false });
      throw error;
    }
  }, []);

  const verify2FA = useCallback(async (userId: string, code: string, tempToken: string, isRecoveryCode: boolean = false) => {
    dispatch({ type: "SET_LOADING", payload: true });
    dispatch({ type: "SET_ERROR", payload: null });

    try {
      const response = await fetch("/api/auth/verify-2fa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          tempToken,
          ...(isRecoveryCode ? { recoveryCode: code } : { code }),
        }),
        credentials: "include",
      });

      const result = await readJsonOrText(response);

      if (!response.ok) {
        throw new Error(result?.error || "2FA verification failed");
      }

      const data = result?.data;
      if (!data?.sessionId || !data?.sessionToken) {
        throw new Error("2FA verification failed");
      }

      const session: AuthSession = {
        id: data.sessionId,
        sessionToken: data.sessionToken,
      };

      const me = await refreshMe();
      if (!me?.id) {
        throw new Error("2FA verification succeeded but session initialization failed");
      }
      dispatch({ type: "SET_SESSION", payload: session });
      dispatch({ type: "SET_LOADING", payload: false });

      const success: LoginSuccessResult = { user: me, session };
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
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
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
    session: state.session,
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
