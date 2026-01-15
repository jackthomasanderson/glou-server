import "dotenv/config";
import pg from "pg";
import { BottleService } from "../services/bottles.js";
import { DatabaseService } from "../services/database.js";

async function testList() {
    const db = new DatabaseService();
    const service = new BottleService(db);
    const userId = "d9f09258-40ad-4806-8474-e4f808f3563f"; // Romain

    try {
        const bottles = await service.getBottlesByUserId(userId);
        console.log(`Found ${bottles.length} bottles for user ${userId}:`);
        console.log(JSON.stringify(bottles, null, 2));
    } catch (err) {
        console.error("Error testing list:", err);
    } finally {
        await (db as any).pool.end();
    }
}

testList();
