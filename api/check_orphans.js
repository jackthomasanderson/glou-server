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
        const res = await pool.query('SELECT id, user_id, cellar_id FROM bottles WHERE cellar_id = $1', ['3c642481-d237-45da-812a-3a60625a2454']);
        console.log(res.rows);
    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

run();
