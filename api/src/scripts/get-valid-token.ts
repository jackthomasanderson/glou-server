import "dotenv/config";
import pg from "pg";

async function getValidToken() {
    const client = new pg.Client({
        host: process.env.DB_HOST,
        port: parseInt(process.env.DB_PORT || "5432"),
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
    });

    try {
        await client.connect();
        // Get the most recent valid session for Romain
        const res = await client.query(`
            SELECT s.token, s.user_id, s.expires_at, u.username 
            FROM sessions s
            JOIN users u ON s.user_id = u.id
            WHERE u.username = 'Romain'
              AND s.expires_at > NOW()
            ORDER BY s.created_at DESC
            LIMIT 1
        `);

        if (res.rows.length === 0) {
            console.log("No valid session found for Romain!");

            // Check if there are any sessions at all
            const allSessions = await client.query(`SELECT COUNT(*) FROM sessions`);
            console.log("Total sessions in DB:", allSessions.rows[0].count);
        } else {
            console.log("Valid session token:", res.rows[0].token);
            console.log("User ID:", res.rows[0].user_id);
            console.log("Expires:", res.rows[0].expires_at);
        }
    } catch (err) {
        console.error("Error:", err);
    } finally {
        await client.end();
    }
}

getValidToken();
