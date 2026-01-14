import { DatabaseService } from "../services/database.js";
import dotenv from "dotenv";

dotenv.config();

const db = new DatabaseService();

async function run() {
    try {
        console.log("Adding new columns to cellars table...");

        // Add columns if they don't exist
        await db.query(`
      ALTER TABLE cellars
      ADD COLUMN IF NOT EXISTS placement TEXT,
      ADD COLUMN IF NOT EXISTS model_name TEXT,
      ADD COLUMN IF NOT EXISTS bottle_capacity INTEGER,
      ADD COLUMN IF NOT EXISTS shelf_count INTEGER;
    `, []);

        console.log("Columns added successfully.");
    } catch (err) {
        console.error("Error updating cellars table:", err);
    } finally {
        await db.close();
    }
}

run();
