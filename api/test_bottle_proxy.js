import pkg from 'node-fetch';
const fetch = pkg;

const CELLAR_ID = '3c642481-d237-45da-812a-3a60625a2454';

async function run() {
    try {
        const url = `http://localhost:3000/api/bottles/cellar/${CELLAR_ID}`;
        console.log(`Fetching from proxy: ${url}`);
        const res = await fetch(url);
        console.log('Status:', res.status);
        if (res.ok) {
            const data = await res.json();
            console.log('Data length:', data.length);
            console.log('Data:', JSON.stringify(data, null, 2));
        } else {
            console.log('Error:', await res.text());
        }
    } catch (err) {
        console.error('Error:', err.message);
    }
}

run();
