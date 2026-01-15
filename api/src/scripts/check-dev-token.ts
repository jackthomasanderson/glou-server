import "dotenv/config";
import pg from "pg";

async function checkDevToken() {
    const client = new pg.Client({
        host: process.env.DB_HOST,
        port: parseInt(process.env.DB_PORT || "5432"),
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
    });

    const DEV_TOKEN = "b86ec35d86f3b78e55f577d7ce366ae1d40c12cafa6a44777d771e5acb7d12f2";

    try {
        await client.connect();
        const res = await client.query(`
            SELECT s.id, s.user_id, s.expires_at, u.username 
            FROM sessions s
            JOIN users u ON s.user_id = u.id
            WHERE s.token = $1
        `, [DEV_TOKEN]);

        if (res.rows.length === 0) {
            console.log("DEV_TOKEN not found in sessions table!");
        } else {
            console.log("Session found:", JSON.stringify(res.rows[0], null, 2));
            console.log("Expires:", res.rows[0].expires_at);
            console.log("Is expired?", new Date(res.rows[0].expires_at) < new Date());
        }
    } catch (err) {
        console.error("Error:", err);
    } finally {
        await client.end();
    }
}

checkDevToken();
