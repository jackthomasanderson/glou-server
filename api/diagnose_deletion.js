import fetch from 'node-fetch';

const API_BASE = 'http://localhost:3001/api';
const SESSION_TOKEN = '152439401725447741b6288efeae9ae07caeb5e97bdd349850f7814a7e17a119';
const TEST_CELLAR_ID = '00000000-0000-0000-0000-000000000001';

async function diagnoseCellarDeletion() {
    console.log('=== DIAGNOSTIC: Suppression de Cave ===\n');

    try {
        // 1. Vérifier que la cave existe
        console.log('1. Vérification de l\'existence de la cave de test:');
        const cellarsResponse = await fetch(`${API_BASE}/cellars`, {
            headers: {
                'Cookie': `session_token=${SESSION_TOKEN}`,
                'Content-Type': 'application/json'
            }
        });

        if (!cellarsResponse.ok) {
            console.log('   ❌ Erreur lors de la récupération des caves:', cellarsResponse.status);
            return;
        }

        const cellars = await cellarsResponse.json();
        const testCellar = cellars.find(c => c.id === TEST_CELLAR_ID);

        if (!testCellar) {
            console.log('   ❌ Cave de test non trouvée!');
            console.log('   Caves disponibles:', cellars.map(c => ({ id: c.id.substring(0, 8) + '...', name: c.name })));
            return;
        }

        console.log('   ✓ Cave trouvée:', testCellar.name);
        console.log('   ID:', testCellar.id);

        // 2. Tenter la suppression
        console.log('\n2. Tentative de suppression via DELETE:');
        const deleteResponse = await fetch(`${API_BASE}/cellars/${TEST_CELLAR_ID}`, {
            method: 'DELETE',
            headers: {
                'Cookie': `session_token=${SESSION_TOKEN}`,
                'Content-Type': 'application/json'
            }
        });

        console.log('   Status:', deleteResponse.status, deleteResponse.statusText);

        if (!deleteResponse.ok) {
            const errorBody = await deleteResponse.text();
            console.log('   ❌ ÉCHEC!');
            console.log('   Body:', errorBody);

            // Essayer de parser comme JSON
            try {
                const errorJson = JSON.parse(errorBody);
                console.log('   Error details:', errorJson);
            } catch (e) {
                // Pas du JSON
            }
            return;
        }

        console.log('   ✓ Suppression réussie (status 204)');

        // 3. Vérifier que la cave a bien été supprimée
        console.log('\n3. Vérification de la suppression:');
        await new Promise(resolve => setTimeout(resolve, 500));

        const checkResponse = await fetch(`${API_BASE}/cellars`, {
            headers: {
                'Cookie': `session_token=${SESSION_TOKEN}`,
                'Content-Type': 'application/json'
            }
        });

        const cellarsAfter = await checkResponse.json();
        const stillExists = cellarsAfter.find(c => c.id === TEST_CELLAR_ID);

        if (stillExists) {
            console.log('   ❌ PROBLÈME: La cave existe encore!');
        } else {
            console.log('   ✓ Cave bien supprimée');
        }

        // 4. Vérifier les bouteilles
        console.log('\n4. Vérification des bouteilles:');
        const bottlesResponse = await fetch(`${API_BASE}/bottles`, {
            headers: {
                'Cookie': `session_token=${SESSION_TOKEN}`,
                'Content-Type': 'application/json'
            }
        });

        const bottles = await bottlesResponse.json();
        const orphanBottles = bottles.filter(b => b.cellarId === TEST_CELLAR_ID);

        if (orphanBottles.length > 0) {
            console.log('   ❌ PROBLÈME: Bouteilles orphelines détectées!');
            orphanBottles.forEach(b => console.log('     -', b.label));
        } else {
            console.log('   ✓ Aucune bouteille orpheline');
        }

        console.log('\n=== RÉSULTAT ===');
        console.log('Suppression API:', !stillExists ? '✓ OK' : '❌ ÉCHEC');
        console.log('CASCADE bouteilles:', orphanBottles.length === 0 ? '✓ OK' : '❌ ÉCHEC');

    } catch (error) {
        console.error('\n❌ ERREUR:', error.message);
        console.error('Stack:', error.stack);
    }
}

diagnoseCellarDeletion();
