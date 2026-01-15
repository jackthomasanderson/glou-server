import "dotenv/config";
import pg from "pg";

async function getRecentToken() {
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
            SELECT token 
            FROM sessions 
            ORDER BY created_at DESC 
            LIMIT 1
        `);
        console.log("Recent Token:", res.rows[0]?.token);
    } catch (err) {
        console.error("Error:", err);
    } finally {
        await client.end();
    }
}

getRecentToken();
