import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
    host: 'localhost',
    user: 'glou',
    password: 'glou',
    database: 'glou',
    port: 5432,
});

const userId = 'd9f09258-40ad-4806-8474-e4f808f3563f';

async function run() {
    try {
        const cellars = await pool.query('SELECT id, name FROM cellars WHERE user_id = $1', [userId]);
        console.log('Cellars:', JSON.stringify(cellars.rows, null, 2));

        const bottles = await pool.query('SELECT id, name, category, cellar_id FROM bottles WHERE user_id = $1', [userId]);
        console.log('Bottles:', JSON.stringify(bottles.rows, null, 2));

    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

run();
