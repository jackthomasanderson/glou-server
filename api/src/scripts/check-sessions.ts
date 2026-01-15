import "dotenv/config";
import pg from "pg";

async function checkSessions() {
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
            SELECT s.id, s.user_id, u.username 
            FROM sessions s
            JOIN users u ON s.user_id = u.id
            ORDER BY s.created_at DESC
            LIMIT 5
        `);
        console.log("Recent sessions:", JSON.stringify(res.rows, null, 2));
    } catch (err) {
        console.error("Error checking sessions:", err);
    } finally {
        await client.end();
    }
}

checkSessions();
