import fetch from 'node-fetch';

const API_BASE = 'http://localhost:3001/api';
const SESSION_TOKEN = '152439401725447741b6288efeae9ae07caeb5e97bdd349850f7814a7e17a119';
const CELLAR_ID = 'e00ca69c-5453-46e3-8850-3b406676144a'; // 'test'

async function testCellarDeletion() {
    console.log('=== TEST API: Suppression de Cave ===\n');

    try {
        // 1. Récupérer l'état initial via API
        console.log('1. GET /api/cellars (AVANT suppression):');
        const cellarsBefore = await fetch(`${API_BASE}/cellars`, {
            headers: {
                'Cookie': `session_token=${SESSION_TOKEN}`,
                'Content-Type': 'application/json'
            }
        });
        const cellarsDataBefore = await cellarsBefore.json();
        const targetCellar = cellarsDataBefore.find(c => c.id === CELLAR_ID);
        console.log('   Cave cible:', targetCellar ? `${targetCellar.name} (${targetCellar.bottleCount || 0} bouteilles)` : 'NOT FOUND');

        // 2. Récupérer les bouteilles AVANT
        console.log('\n2. GET /api/bottles (AVANT suppression):');
        const bottlesBefore = await fetch(`${API_BASE}/bottles`, {
            headers: {
                'Cookie': `session_token=${SESSION_TOKEN}`,
                'Content-Type': 'application/json'
            }
        });
        const bottlesDataBefore = await bottlesBefore.json();
        const bottlesInCellar = bottlesDataBefore.filter(b => b.cellarId === CELLAR_ID);
        console.log('   Bouteilles dans cette cave:', bottlesInCellar.length);
        bottlesInCellar.forEach(b => {
            console.log(`     - ${b.label} (id: ${b.id.substring(0, 8)}...)`);
        });

        // 3. Supprimer la cave via API
        console.log('\n3. DELETE /api/cellars/:cellarId:');
        const deleteResponse = await fetch(`${API_BASE}/cellars/${CELLAR_ID}`, {
            method: 'DELETE',
            headers: {
                'Cookie': `session_token=${SESSION_TOKEN}`,
                'Content-Type': 'application/json'
            }
        });

        console.log('   Status:', deleteResponse.status, deleteResponse.statusText);
        console.log('   Headers:', Object.fromEntries(deleteResponse.headers.entries()));

        const deleteBody = await deleteResponse.text();
        console.log('   Body:', deleteBody || '(empty - 204 No Content)');

        if (!deleteResponse.ok) {
            console.log('   ❌ ÉCHEC de la suppression!');
            return;
        }
        console.log('   ✓ Suppression réussie');

        // 4. Attendre un peu pour que les changements se propagent
        await new Promise(resolve => setTimeout(resolve, 500));

        // 5. Vérifier l'état APRÈS via API
        console.log('\n4. GET /api/cellars (APRÈS suppression):');
        const cellarsAfter = await fetch(`${API_BASE}/cellars`, {
            headers: {
                'Cookie': `session_token=${SESSION_TOKEN}`,
                'Content-Type': 'application/json'
            }
        });
        const cellarsDataAfter = await cellarsAfter.json();
        const cellarStillExists = cellarsDataAfter.find(c => c.id === CELLAR_ID);
        console.log('   Cave existe encore?', cellarStillExists ? '❌ OUI (PROBLÈME!)' : '✓ NON');

        // 6. Vérifier les bouteilles APRÈS
        console.log('\n5. GET /api/bottles (APRÈS suppression):');
        const bottlesAfter = await fetch(`${API_BASE}/bottles`, {
            headers: {
                'Cookie': `session_token=${SESSION_TOKEN}`,
                'Content-Type': 'application/json'
            }
        });
        const bottlesDataAfter = await bottlesAfter.json();
        const bottlesStillInCellar = bottlesDataAfter.filter(b => b.cellarId === CELLAR_ID);
        console.log('   Bouteilles avec cellar_id supprimé:', bottlesStillInCellar.length);

        if (bottlesStillInCellar.length > 0) {
            console.log('   ❌ PROBLÈME: Des bouteilles existent encore!');
            bottlesStillInCellar.forEach(b => {
                console.log(`     - ${b.label} (id: ${b.id.substring(0, 8)}...)`);
            });
        } else {
            console.log('   ✓ Aucune bouteille orpheline');
        }

        // 7. Vérifier les bouteilles orphelines
        const orphanBottles = bottlesDataAfter.filter(b => {
            return !cellarsDataAfter.some(c => c.id === b.cellarId);
        });
        console.log('\n6. Bouteilles orphelines (cellarId invalide):');
        if (orphanBottles.length > 0) {
            console.log('   ⚠️  PROBLÈME:', orphanBottles.length, 'bouteille(s) orpheline(s)');
            orphanBottles.forEach(b => {
                console.log(`     - ${b.label} (cellarId: ${b.cellarId})`);
            });
        } else {
            console.log('   ✓ Aucune bouteille orpheline');
        }

        console.log('\n=== RÉSUMÉ ===');
        console.log('Cave supprimée:', !cellarStillExists ? '✓' : '❌');
        console.log('Bouteilles CASCADE:', bottlesStillInCellar.length === 0 ? '✓' : '❌');
        console.log('Pas d\'orphelins:', orphanBottles.length === 0 ? '✓' : '❌');

    } catch (error) {
        console.error('\n❌ ERREUR:', error.message);
        console.error('Stack:', error.stack);
    }

    console.log('\n=== FIN DU TEST API ===');
}

testCellarDeletion();
