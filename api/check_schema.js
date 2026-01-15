import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
    host: 'localhost',
    user: 'glou',
    password: 'glou',
    database: 'glou_server', // UPDATE: User metadata said 'c:\Users\Romain\Documents\glou-server', database name might differ.
    // wait, the previous script had 'database: glou' and seemingly worked (exit code 0). 
    // BUT the output was truncated so I'm not 100% sure it connected to the RIGHT db. 
    // Let's stick to 'glou' if it worked.
    database: 'glou',
    port: 5432,
});

async function run() {
    try {
        const res = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'bottles'");
        const columns = res.rows.map(r => r.column_name);
        const cigarCols = [
            'quantity_in_box', 'cigar_format', 'leaf_origin', 'binder', 'filler',
            'factory_code', 'target_humidity', 'humidification_system', 'manufacture_year'
        ];

        console.log("Existing columns:", columns.sort());
        console.log("\n--- Checking Cigar Columns ---");
        cigarCols.forEach(col => {
            console.log(`${col}: ${columns.includes(col) ? 'EXISTS' : 'MISSING'}`);
        });

    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

run();
