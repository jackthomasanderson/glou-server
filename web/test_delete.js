
const userId = 'd9f09258-40ad-4806-8474-e4f808f3563f';
const bottleId = 'b2173423-a9d8-459b-96c9-78740e968564';
(async () => {
    const res = await fetch(`http://localhost:3000/api/bottles/${bottleId}`, {
        method: 'DELETE',
        headers: {
            'Content-Type': 'application/json',
            'x-user-id': userId,
        },
    });
    const text = await res.text();
    console.log('Status:', res.status);
    try {
        const data = JSON.parse(text);
        console.log('Response JSON:', data);
    } catch {
        console.log('Response Text:', text);
    }
})();
