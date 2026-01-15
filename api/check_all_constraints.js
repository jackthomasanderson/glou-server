import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
    host: 'localhost',
    user: 'glou',
    password: 'glou',
    database: 'glou',
    port: 5432,
});

async function run() {
    try {
        const res = await pool.query(`
            SELECT
                conname AS constraint_name,
                conrelid::regclass AS table_name,
                contype AS constraint_type,
                confrelid::regclass AS foreign_table_name
            FROM
                pg_constraint;
        `);
        console.log(JSON.stringify(res.rows, null, 2));

    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

run();
