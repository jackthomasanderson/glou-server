import { type AuthUser } from "./AuthContext";



/**
 * Auth API client
 */
export class AuthClient {
  private baseUrl: string;

  constructor(baseUrl: string = "/api") {
    this.baseUrl = baseUrl;
  }

  async register(
    username: string,
    email: string,
    password: string
  ): Promise<{ id: string; username: string; email: string }> {
    const response = await fetch(`${this.baseUrl}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, email, password }),
      credentials: "include",
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Registration failed");
    }

    const { data } = await response.json();
    return data;
  }

  async login(
    username: string,
    password: string
  ): Promise<
    | { sessionToken: string; userId: string; username: string; email: string }
    | { requiresTwoFA: boolean; userId: string; tempToken: string; twoFAMethod: string }
  > {
    const response = await fetch(`${this.baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
      credentials: "include",
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Login failed");
    }

    const result = await response.json();
    return result.data || result;
  }

  async verify2FA(
    userId: string,
    code: string,
    tempToken: string,
    isRecoveryCode: boolean = false
  ): Promise<{ sessionToken: string; userId: string; username: string; email: string }> {
    const response = await fetch(`${this.baseUrl}/auth/verify-2fa`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId,
        [isRecoveryCode ? "recoveryCode" : "code"]: code,
        tempToken,
      }),
      credentials: "include",
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "2FA verification failed");
    }

    const { data } = await response.json();
    return data;
  }

  async setupTOTP(): Promise<{
    secret: string;
    qrCode: string;
    manualEntry: string;
    recoveryCodes: string[];
  }> {
    const response = await fetch(`${this.baseUrl}/auth/setup-totp`, {
      method: "POST",
      credentials: "include",
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "TOTP setup failed");
    }

    const { data } = await response.json();
    return data;
  }

  async enableTOTP(secret: string, code: string, recoveryCodes: string[]): Promise<void> {
    const response = await fetch(`${this.baseUrl}/auth/enable-totp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret, code, recoveryCodes }),
      credentials: "include",
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "TOTP enable failed");
    }
  }

  async disableTwoFA(password: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/auth/disable-2fa`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
      credentials: "include",
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Disable 2FA failed");
    }
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/auth/change-password`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
      credentials: "include",
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Password change failed");
    }
  }



  async logout(): Promise<void> {
    await fetch(`${this.baseUrl}/auth/logout`, {
      method: "POST",
      credentials: "include",
    });
  }

  async getCurrentUser(): Promise<AuthUser> {
    const response = await fetch(`${this.baseUrl}/auth/me`, {
      credentials: "include",
    });

    if (!response.ok) {
      throw new Error("Not authenticated");
    }

    const { data } = await response.json();
    return data;
  }

  async getSecurityEvents(limit: number = 20): Promise<unknown[]> {
    const response = await fetch(`${this.baseUrl}/auth/security-events?limit=${limit}`, {
      credentials: "include",
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to get security events");
    }

    const { data } = await response.json();
    return data;
  }
}

export const authClient = new AuthClient();
