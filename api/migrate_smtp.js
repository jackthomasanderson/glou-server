
import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({
    user: process.env.DB_USER || "glou",
    host: process.env.DB_HOST || "localhost",
    database: process.env.DB_NAME || "glou",
    password: process.env.DB_PASSWORD || "glou",
    port: parseInt(process.env.DB_PORT || "5432"),
});

async function migrate() {
    try {
        console.log("Adding SMTP columns to app_settings...");
        await pool.query(`
      ALTER TABLE app_settings
      ADD COLUMN IF NOT EXISTS smtp_host TEXT,
      ADD COLUMN IF NOT EXISTS smtp_port INTEGER,
      ADD COLUMN IF NOT EXISTS smtp_user TEXT,
      ADD COLUMN IF NOT EXISTS smtp_pass TEXT,
      ADD COLUMN IF NOT EXISTS smtp_from TEXT,
      ADD COLUMN IF NOT EXISTS smtp_secure BOOLEAN DEFAULT FALSE;
    `);
        console.log("Done.");
    } catch (err) {
        console.error("Migration failed:", err);
    } finally {
        await pool.end();
    }
}

migrate();
