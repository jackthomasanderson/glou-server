import "dotenv/config";
import pg from "pg";

async function list() {
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
            SELECT id, user_id, cellar_id, label, category FROM bottles
        `);
        console.log(`Found ${res.rows.length} bottles:`);
        res.rows.forEach(row => {
            console.log(JSON.stringify(row));
        });
    } catch (err) {
        console.error("Error listing bottles:", err);
    } finally {
        await client.end();
    }
}

list();
