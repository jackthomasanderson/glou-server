import "dotenv/config";

async function testApi() {
    const res = await fetch("http://localhost:3000/api/bottles", {
        headers: {
            "Cookie": "session_token=YOUR_TOKEN_HERE"
        }
    });
    // This is hard to test without a valid session token.
}
