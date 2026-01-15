import pkg from 'node-fetch';
const fetch = pkg;

async function run() {
    try {
        const res = await fetch('http://localhost:3001/cellars');
        console.log('GET /cellars status:', res.status);

        const res2 = await fetch('http://localhost:3001/api/cellars');
        console.log('GET /api/cellars status:', res2.status);
    } catch (err) {
        console.error(err);
    }
}

run();
