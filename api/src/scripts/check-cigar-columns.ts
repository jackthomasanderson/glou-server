import "dotenv/config";
import pg from "pg";

async function checkColumns() {
    const client = new pg.Client({
        host: process.env.DB_HOST,
        port: parseInt(process.env.DB_PORT || "5432"),
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
    });

    try {
        await client.connect();
        const res = await client.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'bottles' 
            AND column_name IN ('binder', 'filler')
        `);
        console.log("Columns found:", res.rows.map(r => r.column_name));
    } catch (err) {
        console.error("Error checking columns:", err);
    } finally {
        await client.end();
    }
}

checkColumns();
