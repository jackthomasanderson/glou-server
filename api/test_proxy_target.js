import pkg from 'node-fetch';
const fetch = pkg;

const CELLAR_ID = '3c642481-d237-45da-812a-3a60625a2454';

async function run() {
    try {
        // This is what the frontend calls, which goes to the Next.js Route Handler
        // But since I'm running from outside, I should call the backend directly
        // to see if the backend responds correctly to the expected proxied URL.
        const proxiedUrl = `http://localhost:3001/bottles/cellar/${CELLAR_ID}`;
        console.log(`Checking proxied URL (mistakenly missing /api): ${proxiedUrl}`);
        const res = await fetch(proxiedUrl);
        console.log('Status:', res.status);
        if (res.ok) {
            console.log('Data:', await res.json());
        }

        const correctUrl = `http://localhost:3001/api/bottles/cellar/${CELLAR_ID}`;
        console.log(`\nChecking correct URL (with /api): ${correctUrl}`);
        const res2 = await fetch(correctUrl);
        console.log('Status:', res2.status);
        if (res2.ok) {
            console.log('Data:', await res2.json());
        }
    } catch (err) {
        console.error(err);
    }
}

run();
