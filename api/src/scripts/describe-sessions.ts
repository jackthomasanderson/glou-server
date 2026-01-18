import "dotenv/config";
import pg from "pg";

async function describeSessions() {
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
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'sessions'
        `);
        console.log("Columns in 'sessions':", res.rows);

        const res2 = await client.query(`SELECT * FROM sessions LIMIT 1`);
        console.log("Sample session:", res2.rows[0]);
    } catch (err) {
        console.error("Error:", err);
    } finally {
        await client.end();
    }
}

describeSessions();
