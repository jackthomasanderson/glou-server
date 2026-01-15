import "dotenv/config";
import { CellarService } from "../services/cellars.js";
import { DatabaseService } from "../services/database.js";

async function testCellars() {
    const db = new DatabaseService();
    const service = new CellarService(db);
    const userId = "d9f09258-40ad-4806-8474-e4f808f3563f"; // Romain

    try {
        const cellars = await service.getCellarsByUserId(userId);
        console.log(`Found ${cellars.length} cellars for user ${userId}:`);
        console.log(JSON.stringify(cellars, null, 2));
    } catch (err) {
        console.error("Error testing cellars:", err);
    } finally {
        await (db as any).pool.end();
    }
}

testCellars();
