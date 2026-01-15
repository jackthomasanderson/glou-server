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
        const bottleId = 'dc5047a9-ff36-4fae-ad5c-8aa347449e21';
        const res = await pool.query('SELECT * FROM bottles WHERE id = $1', [bottleId]);
        console.log(JSON.stringify(res.rows[0], null, 2));
    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

run();
