async function testApi() {
    console.log("Testing API with session token...");
    try {
        const token = "b86ec35d86f3b78e55f577d7ce366ae1d40c12cafa6a44777d771e5acb7d12f2";
        const res = await fetch("http://localhost:3001/api/bottles", {
            headers: {
                "Cookie": `session_token=${token}`
            }
        });
        console.log("Status:", res.status);
        const data = await res.json();
        console.log("Response:", JSON.stringify(data, null, 2));
    } catch (err) {
        console.error("API call failed:", err);
    }
}

testApi();
