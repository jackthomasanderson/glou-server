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
const cellarId = 'e00ca69c-5453-46e3-8850-3b406676144a'; // 'test'

async function run() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        console.log(`Checking if cellar ${cellarId} exists for user ${userId}`);
        const res = await client.query('SELECT * FROM cellars WHERE id = $1 AND user_id = $2', [cellarId, userId]);
        if (res.rows.length === 0) {
            console.log('Cellar not found');
        } else {
            console.log('Cellar found. Attempting deletion...');
            const delRes = await client.query('DELETE FROM cellars WHERE id = $1 AND user_id = $2', [cellarId, userId]);
            console.log('Deletion result:', delRes.rowCount);
        }

        await client.query('ROLLBACK');
        console.log('Transaction rolled back successfully');
    } catch (err) {
        console.error('Error during simulated deletion:', err);
        if (client) await client.query('ROLLBACK');
    } finally {
        client.release();
        await pool.end();
    }
}

run();
