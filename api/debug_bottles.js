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
        // Get table structure
        const structure = await pool.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'bottles'
            ORDER BY ordinal_position
        `);
        console.log('=== Bottles Table Structure ===');
        console.log(JSON.stringify(structure.rows, null, 2));

        // Get all bottles
        const bottles = await pool.query("SELECT * FROM bottles ORDER BY created_at DESC LIMIT 10");
        console.log('\n=== Recent Bottles ===');
        console.log(JSON.stringify(bottles.rows, null, 2));

        // Get all cellars
        const cellars = await pool.query("SELECT id, user_id, name FROM cellars");
        console.log('\n=== All Cellars ===');
        console.log(JSON.stringify(cellars.rows, null, 2));

        // Get bottle count per cellar
        const stats = await pool.query(`
            SELECT 
                c.id as cellar_id,
                c.name as cellar_name,
                COUNT(b.id) as bottle_count
            FROM cellars c
            LEFT JOIN bottles b ON b.cellar_id = c.id AND b.deleted_at IS NULL
            GROUP BY c.id, c.name
            ORDER BY c.name
        `);
        console.log('\n=== Cellar Stats ===');
        console.log(JSON.stringify(stats.rows, null, 2));

    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

run();
