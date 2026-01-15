import pkg from 'node-fetch';
const fetch = pkg;

async function run() {
    try {
        // If the Next.js server is running on 3000, we can test its proxy
        const res = await fetch('http://localhost:3000/api/cellars');
        console.log('Proxy GET /api/cellars status:', res.status);
        if (res.ok) {
            const data = await res.json();
            console.log('Proxy GET /api/cellars data length:', data.length);
        } else {
            console.log('Proxy GET /api/cellars error:', await res.text());
        }
    } catch (err) {
        console.error('Connection error (is Next.js running?):', err.message);
    }
}

run();
