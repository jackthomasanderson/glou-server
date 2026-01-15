async function testApi() {
    const token = "152439401725447741b6288efeae9ae07caeb5e97bdd349850f7814a7e17a119";
    console.log("Testing API with valid token...");
    try {
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
