import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
    host: 'localhost',
    user: 'glou',
    password: 'glou',
    database: 'glou',
    port: 5432,
});

const TARGET_CELLAR_ID = '3c642481-d237-45da-812a-3a60625a2454';

async function run() {
    try {
        const cellarRes = await pool.query('SELECT * FROM cellars WHERE id = $1', [TARGET_CELLAR_ID]);
        if (cellarRes.rows.length > 0) {
            console.log('Cellar:', JSON.stringify(cellarRes.rows[0], null, 2));
        } else {
            console.log('Cellar not found');
        }
    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

run();
