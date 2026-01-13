import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
    host: 'localhost',
    user: 'glou',
    password: 'glou',
    database: 'glou',
    port: 5432,
});

const bottleId = 'b2173423-a9d8-459b-96c9-78740e968564';

(async () => {
    try {
        const res = await pool.query('DELETE FROM bottles WHERE id = $1', [bottleId]);
        console.log(`Deleted rows: ${res.rowCount}`);
    } catch (err) {
        console.error('Error deleting bottle:', err);
    } finally {
        await pool.end();
    }
})();
