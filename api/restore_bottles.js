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
        // Restore all soft-deleted bottles
        const result = await pool.query(`
            UPDATE bottles 
            SET deleted_at = NULL 
            WHERE deleted_at IS NOT NULL
            RETURNING id, label, cellar_id
        `);

        console.log(`Restored ${result.rowCount} bottle(s):`);
        console.log(JSON.stringify(result.rows, null, 2));

    } catch (err) {
        console.error('Error restoring bottles:', err);
    } finally {
        await pool.end();
    }
}

run();
