import "dotenv/config";
import pg from "pg";

async function alterTable() {
    const client = new pg.Client({
        host: process.env.DB_HOST,
        port: parseInt(process.env.DB_PORT || "5432"),
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
    });

    try {
        await client.connect();
        console.log("Connected to database. Dropping deleted_at column...");
        await client.query("ALTER TABLE bottles DROP COLUMN IF EXISTS deleted_at");
        console.log("Successfully dropped deleted_at column.");
    } catch (err) {
        console.error("Error altering table:", err);
    } finally {
        await client.end();
    }
}

alterTable();
