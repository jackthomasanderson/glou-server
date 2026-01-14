import "dotenv/config";
import pg from "pg";

async function reset() {
    const client = new pg.Client({
        host: process.env.DB_HOST,
        port: parseInt(process.env.DB_PORT || "5432"),
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
    });

    try {
        await client.connect();
        console.log("Connected to database. Deleting all bottles...");
        const res = await client.query("DELETE FROM bottles");
        console.log(`Successfully deleted ${res.rowCount} bottles.`);
    } catch (err) {
        console.error("Error resetting bottles:", err);
    } finally {
        await client.end();
    }
}

reset();
