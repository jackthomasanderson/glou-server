import "dotenv/config";
import pg from "pg";
import { v4 as uuidv4 } from "uuid";

async function create() {
    const client = new pg.Client({
        host: process.env.DB_HOST,
        port: parseInt(process.env.DB_PORT || "5432"),
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
    });

    const userId = "d9f09258-40ad-4806-8474-e4f808f3563f";
    const cellarId = "e00ca69c-5453-46e3-8850-3b406676144a";
    const id = uuidv4();
    const now = new Date().toISOString();

    const query = `
      INSERT INTO bottles (
        id, user_id, cellar_id, category, label,
        producer_name, name_edition, vintage_or_none, abv,
        is_opened, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9,
        $10, $11, $12
      )
      RETURNING *
    `;

    const values = [
        id, userId, cellarId, "wine", "Test Bottle",
        "Test Producer", "Test Name", "2020", 13.5,
        false, now, now
    ];

    try {
        await client.connect();
        console.log("Attempting to insert bottle...");
        const res = await client.query(query, values);
        console.log("Success! Inserted bottle:");
        console.log(JSON.stringify(res.rows[0]));
    } catch (err) {
        console.error("Error creating bottle:", err);
    } finally {
        await client.end();
    }
}

create();
