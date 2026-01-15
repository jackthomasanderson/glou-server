import "dotenv/config";
import pg from "pg";

async function listAll() {
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
            SELECT b.id, b.user_id, b.cellar_id, b.label, u.username 
            FROM bottles b
            LEFT JOIN users u ON b.user_id = u.id
        `);
        console.log(`Found ${res.rows.length} total bottles:`);
        res.rows.forEach(row => {
            console.log(JSON.stringify(row));
        });
    } catch (err) {
        console.error("Error listing bottles:", err);
    } finally {
        await client.end();
    }
}

listAll();
