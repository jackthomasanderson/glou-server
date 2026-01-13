(async () => {
    const userId = 'd9f09258-40ad-4806-8474-e4f808f3563f';
    const bottleId = 'b2173423-a9d8-459b-96c9-78740e968564';
    const res = await fetch(`http://localhost:3000/api/bottles/${bottleId}`, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            'x-user-id': userId,
        },
    });
    const text = await res.text();
    console.log('GET Status:', res.status);
    console.log('GET Response:', text);
})();
