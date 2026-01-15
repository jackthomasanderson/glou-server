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
        console.log('--- ALL BOTTLES ---');
        const res = await pool.query('SELECT id, cellar_id, category, label, user_id FROM bottles');
        console.log(JSON.stringify(res.rows, null, 2));

        console.log('\n--- ALL CELLARS ---');
        const res2 = await pool.query('SELECT id, user_id, name FROM cellars');
        console.log(JSON.stringify(res2.rows, null, 2));

    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

run();
