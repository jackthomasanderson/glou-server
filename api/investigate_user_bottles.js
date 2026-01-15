import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
    host: 'localhost',
    user: 'glou',
    password: 'glou',
    database: 'glou',
    port: 5432,
});

const USER_ID = 'd9f09258-40ad-4806-8474-e4f808f3563f';

async function run() {
    try {
        console.log(`Checking all bottles for user: ${USER_ID}`);

        const bottles = await pool.query('SELECT id, cellar_id, category, label, quantity_in_box FROM bottles WHERE user_id = $1', [USER_ID]);
        console.log(`Found ${bottles.rows.length} bottles in total.`);
        console.log(JSON.stringify(bottles.rows, null, 2));

        const cellars = await pool.query('SELECT id, name FROM cellars WHERE user_id = $1', [USER_ID]);
        console.log('\nCellars:');
        console.log(JSON.stringify(cellars.rows, null, 2));

    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

run();
