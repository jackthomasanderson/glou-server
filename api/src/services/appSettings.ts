import { DatabaseService } from "./database.js";
import { logger } from "../utils/logger.js";

export type AppSettings = {
  aiApiKey: string | null;
  appName?: string | null;
  appTagline?: string | null;
  logoUrl?: string | null;
};

export class AppSettingsService {
  constructor(private db: DatabaseService) {}

  async getAppSettings(): Promise<AppSettings & { aiApiKey: string | null }> {
    const query = `
      SELECT
        app_name as "appName",
        app_tagline as "appTagline",
        logo_url as "logoUrl",
        ai_api_key as "aiApiKey",
        updated_at as "updatedAt"
      FROM app_settings
      WHERE id = TRUE
    `;
    const result = await this.db.query(query, []);
    const row = result.rows[0] as (AppSettings & { aiApiKey: string | null }) | undefined;
    if (row) return row;
    await this.db.query(
      `INSERT INTO app_settings (id, app_name, app_tagline, logo_url, ai_api_key) VALUES (TRUE, NULL, NULL, NULL, NULL) ON CONFLICT (id) DO NOTHING`,
      []
    );
    const again = await this.db.query(query, []);
    return again.rows[0] as AppSettings & { aiApiKey: string | null };
  }

  async setAiApiKey(aiApiKey: string | null): Promise<void> {
    const query = `UPDATE app_settings SET ai_api_key = $1, updated_at = NOW() WHERE id = TRUE`;
    await this.db.query(query, [aiApiKey]);
  }

  async updateAppSettings(input: Partial<{ appName: string | null; appTagline: string | null; logoUrl: string | null }>): Promise<AppSettings> {
    const fields: { column: string; key: keyof typeof input }[] = [
      { column: "app_name", key: "appName" },
      { column: "app_tagline", key: "appTagline" },
      { column: "logo_url", key: "logoUrl" },
    ];
    const setParts: string[] = [];
    const params: unknown[] = [];
    for (const field of fields) {
      if (typeof (input as any)[field.key] === "undefined") continue;
      params.push((input as any)[field.key]);
      setParts.push(`${field.column} = $${params.length}`);
    }
    const query = `
      UPDATE app_settings
      SET ${setParts.length ? setParts.join(", ") + "," : ""} updated_at = NOW()
      WHERE id = TRUE
      RETURNING
        app_name as "appName",
        app_tagline as "appTagline",
        logo_url as "logoUrl",
        updated_at as "updatedAt"
    `;
    const result = await this.db.query(query, params);
    return result.rows[0] as AppSettings;
  }
}
