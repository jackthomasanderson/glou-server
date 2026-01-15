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

async function createTestCellarAndBottle() {
    const client = await pool.connect();
    try {
        console.log('=== CRÉATION D\'UNE CAVE ET BOUTEILLE DE TEST ===\n');

        // 1. Créer une cave de test
        const cellarId = '00000000-0000-0000-0000-000000000001';
        const cellarName = 'Cave Test Suppression';

        await client.query('BEGIN');

        // Supprimer si existe déjà
        await client.query('DELETE FROM cellars WHERE id = $1', [cellarId]);

        // Créer la cave
        await client.query(`
            INSERT INTO cellars (id, user_id, name, cellar_type, bottle_capacity, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
        `, [cellarId, userId, cellarName, 'aging', 100]);

        console.log('✓ Cave créée:', cellarName);
        console.log('  ID:', cellarId);

        // 2. Créer une bouteille de test
        const bottleId = '00000000-0000-0000-0000-000000000002';
        const bottleLabel = 'Bouteille Test Cascade';

        await client.query(`
            INSERT INTO bottles (
                id, user_id, cellar_id, category, label,
                producer_name, name_edition, vintage_or_none,
                is_opened, alert_status, quantity_in_box,
                created_at, updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
        `, [
            bottleId, userId, cellarId, 'wine', bottleLabel,
            'Producteur Test', 'Cuvée Test', '2020',
            false, 'none', 1
        ]);

        console.log('✓ Bouteille créée:', bottleLabel);
        console.log('  ID:', bottleId);
        console.log('  Dans la cave:', cellarId);

        await client.query('COMMIT');

        // 3. Vérifier la création
        const cellarCheck = await client.query(
            'SELECT id, name FROM cellars WHERE id = $1',
            [cellarId]
        );
        const bottleCheck = await client.query(
            'SELECT id, label, cellar_id FROM bottles WHERE id = $1',
            [bottleId]
        );

        console.log('\n=== VÉRIFICATION ===');
        console.log('Cave existe:', cellarCheck.rows.length > 0 ? '✓' : '❌');
        console.log('Bouteille existe:', bottleCheck.rows.length > 0 ? '✓' : '❌');
        console.log('Bouteille liée à la cave:', bottleCheck.rows[0]?.cellar_id === cellarId ? '✓' : '❌');

        console.log('\n=== DONNÉES POUR LE TEST ===');
        console.log('CELLAR_ID:', cellarId);
        console.log('BOTTLE_ID:', bottleId);
        console.log('\nVous pouvez maintenant tester la suppression dans l\'interface :');
        console.log('1. Rafraîchir la page http://localhost:3000/cellars');
        console.log('2. Supprimer la cave "' + cellarName + '"');
        console.log('3. Vérifier que la bouteille "' + bottleLabel + '" a disparu de /bottles');

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('\n❌ ERREUR:', err.message);
        console.error('Stack:', err.stack);
    } finally {
        client.release();
        await pool.end();
    }
}

createTestCellarAndBottle();
