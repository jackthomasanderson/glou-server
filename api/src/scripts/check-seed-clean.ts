import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({
    log: ['error'], // Only log errors
});

async function main() {
    console.log("🔍 Diagnosing Users, Cellars, and Bottles...");

    const users = await prisma.users.findMany({
        include: {
            cellars: {
                include: {
                    _count: {
                        select: { bottles: true }
                    }
                }
            },
            _count: {
                select: { bottles: true }
            }
        }
    });

    console.log(`Found ${users.length} users.`);

    for (const user of users) {
        console.log(`User: ${user.display_name || user.username} (ID: ${user.id})`);
        console.log(`  Total Bottles linked to User: ${user._count.bottles}`);

        if (user.cellars.length === 0) {
            console.log("  ⚠️ No cellars found for this user.");
        }

        for (const cellar of user.cellars) {
            console.log(`  - Cellar: "${cellar.name}" (ID: ${cellar.id})`);
            console.log(`    Type: ${cellar.cellar_type}`);
            console.log(`    Bottle Count: ${cellar._count.bottles}`);
        }
        console.log("---");
    }
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
