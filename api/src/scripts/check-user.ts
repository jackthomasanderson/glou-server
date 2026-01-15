import "dotenv/config";
import pg from "pg";

async function checkUser() {
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
            SELECT id, username FROM users WHERE username = 'Romain'
        `);
        console.log("User Romain:", JSON.stringify(res.rows[0]));
    } catch (err) {
        console.error("Error checking user:", err);
    } finally {
        await client.end();
    }
}

checkUser();
