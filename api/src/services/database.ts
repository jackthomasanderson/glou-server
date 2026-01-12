import { Pool, QueryResult } from "pg";
import { logger } from "../utils/logger.js";

/**
 * Database service using PostgreSQL
 */
export class DatabaseService {
  private pool: Pool;

  constructor() {
    try {
      this.pool = new Pool({
        user: process.env.DB_USER || "glou",
        host: process.env.DB_HOST || "localhost",
        database: process.env.DB_NAME || "glou",
        password: process.env.DB_PASSWORD || "glou",
        port: parseInt(process.env.DB_PORT || "5432"),
      });
      // eslint-disable-next-line no-console
      console.log("[DatabaseService] Pool created with config:", {
        user: process.env.DB_USER,
        host: process.env.DB_HOST,
        database: process.env.DB_NAME,
        port: process.env.DB_PORT,
      });
      this.pool.on("error", (err) => {
        logger.error(err, "Unexpected error on idle client");
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[DatabaseService] Fatal error during Pool creation", err);
      throw err;
    }
  }

  /**
   * Execute a query
   */
  async query(text: string, params: unknown[]): Promise<QueryResult> {
    return this.pool.query(text, params);
  }

  /**
   * Close the connection pool
   */
  async close(): Promise<void> {
    await this.pool.end();
  }
}
