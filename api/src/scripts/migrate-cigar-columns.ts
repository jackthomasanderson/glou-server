import "dotenv/config";
import pg from "pg";

async function migrate() {
    const client = new pg.Client({
        host: process.env.DB_HOST,
        port: parseInt(process.env.DB_PORT || "5432"),
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
    });

    try {
        await client.connect();
        console.log("Adding binder and filler columns to bottles table...");
        await client.query(`
            ALTER TABLE bottles 
            ADD COLUMN IF NOT EXISTS binder VARCHAR(80),
            ADD COLUMN IF NOT EXISTS filler VARCHAR(80)
        `);
        console.log("Success!");
    } catch (err) {
        console.error("Migration failed:", err);
    } finally {
        await client.end();
    }
}

migrate();
