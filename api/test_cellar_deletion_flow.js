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
        console.log('=== INVESTIGATION: Cellar Deletion Flow ===\n');

        // 1. Vérifier l'état initial
        console.log('1. État AVANT suppression:');
        const cellarBefore = await client.query(
            'SELECT id, name, user_id FROM cellars WHERE id = $1',
            [cellarId]
        );
        console.log('   Cellar:', cellarBefore.rows[0] || 'NOT FOUND');

        const bottlesBefore = await client.query(
            'SELECT id, label, cellar_id, user_id FROM bottles WHERE cellar_id = $1',
            [cellarId]
        );
        console.log('   Bottles dans cette cave:', bottlesBefore.rows.length);
        bottlesBefore.rows.forEach(b => {
            console.log(`     - ${b.label} (id: ${b.id.substring(0, 8)}...)`);
        });

        // 2. Vérifier les contraintes FK
        console.log('\n2. Vérification des contraintes FK:');
        const fkCheck = await client.query(`
            SELECT
                tc.constraint_name,
                tc.table_name,
                kcu.column_name,
                ccu.table_name AS foreign_table_name,
                ccu.column_name AS foreign_column_name,
                rc.delete_rule
            FROM information_schema.table_constraints AS tc
            JOIN information_schema.key_column_usage AS kcu
                ON tc.constraint_name = kcu.constraint_name
            JOIN information_schema.constraint_column_usage AS ccu
                ON ccu.constraint_name = tc.constraint_name
            JOIN information_schema.referential_constraints AS rc
                ON rc.constraint_name = tc.constraint_name
            WHERE tc.constraint_type = 'FOREIGN KEY'
                AND (tc.table_name = 'bottles' AND kcu.column_name = 'cellar_id')
        `);
        console.log('   FK bottles.cellar_id:', fkCheck.rows[0]);

        // 3. Tester la suppression dans une transaction
        console.log('\n3. Test de suppression (dans une transaction):');
        await client.query('BEGIN');

        const deleteResult = await client.query(
            'DELETE FROM cellars WHERE id = $1 AND user_id = $2 RETURNING id',
            [cellarId, userId]
        );
        console.log('   DELETE result:', deleteResult.rowCount, 'row(s) affected');
        console.log('   Deleted cellar ID:', deleteResult.rows[0]?.id || 'NONE');

        // 4. Vérifier l'état après suppression (toujours dans la transaction)
        const cellarAfter = await client.query(
            'SELECT id, name FROM cellars WHERE id = $1',
            [cellarId]
        );
        console.log('\n4. État APRÈS suppression (dans transaction):');
        console.log('   Cellar:', cellarAfter.rows[0] || 'DELETED (as expected)');

        const bottlesAfter = await client.query(
            'SELECT id, label, cellar_id FROM bottles WHERE cellar_id = $1',
            [cellarId]
        );
        console.log('   Bottles avec cellar_id =', cellarId + ':', bottlesAfter.rows.length);
        if (bottlesAfter.rows.length > 0) {
            console.log('   ⚠️  PROBLÈME: Des bouteilles existent encore!');
            bottlesAfter.rows.forEach(b => {
                console.log(`     - ${b.label} (id: ${b.id.substring(0, 8)}...)`);
            });
        } else {
            console.log('   ✓ CASCADE a fonctionné correctement');
        }

        // 5. Vérifier les bouteilles orphelines potentielles
        const orphanCheck = await client.query(`
            SELECT b.id, b.label, b.cellar_id, b.user_id
            FROM bottles b
            LEFT JOIN cellars c ON b.cellar_id = c.id
            WHERE c.id IS NULL
            LIMIT 5
        `);
        console.log('\n5. Bouteilles orphelines (cellar_id invalide):');
        if (orphanCheck.rows.length > 0) {
            console.log('   ⚠️  PROBLÈME: Bouteilles orphelines détectées!');
            orphanCheck.rows.forEach(b => {
                console.log(`     - ${b.label} (cellar_id: ${b.cellar_id})`);
            });
        } else {
            console.log('   ✓ Aucune bouteille orpheline');
        }

        // 6. Rollback pour ne pas modifier les données
        await client.query('ROLLBACK');
        console.log('\n6. Transaction ROLLBACK (données restaurées)');

        // 7. Vérifier que les données sont bien restaurées
        const cellarRestored = await client.query(
            'SELECT id, name FROM cellars WHERE id = $1',
            [cellarId]
        );
        console.log('\n7. Vérification après ROLLBACK:');
        console.log('   Cellar:', cellarRestored.rows[0] ? 'RESTORED ✓' : 'STILL MISSING ⚠️');

        const bottlesRestored = await client.query(
            'SELECT COUNT(*) as count FROM bottles WHERE cellar_id = $1',
            [cellarId]
        );
        console.log('   Bottles count:', bottlesRestored.rows[0].count);

        console.log('\n=== FIN DE L\'INVESTIGATION ===');

    } catch (err) {
        console.error('\n❌ ERREUR:', err.message);
        console.error('Stack:', err.stack);
        await client.query('ROLLBACK');
    } finally {
        client.release();
        await pool.end();
    }
}

run();
