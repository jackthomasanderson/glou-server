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
        const res = await pool.query("SELECT id, cellar_id FROM bottles");
        console.log(JSON.stringify(res.rows, null, 2));
    } catch (err) {
        // console.error(err);
        // If cellar_id doesn't exist, try something else
        try {
            const res2 = await pool.query("SELECT id FROM bottles");
            console.log(JSON.stringify(res2.rows, null, 2));
        } catch (e) {
            console.error(e);
        }
    } finally {
        await pool.end();
    }
}

run();
