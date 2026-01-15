import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
    host: 'localhost',
    user: 'glou',
    password: 'glou',
    database: 'glou',
    port: 5432,
});

const DEV_TOKEN = '152439401725447741b6288efeae9ae07caeb5e97bdd349850f7814a7e17a119';

async function run() {
    try {
        const res = await pool.query('SELECT user_id FROM sessions WHERE token = $1', [DEV_TOKEN]);
        if (res.rows.length > 0) {
            const userId = res.rows[0].user_id;
            console.log('DEV_TOKEN belongs to user:', userId);
            const user = await pool.query('SELECT username FROM users WHERE id = $1', [userId]);
            console.log('Username:', user.rows[0].username);
        } else {
            console.log('DEV_TOKEN not found in sessions table.');
        }
    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

run();
