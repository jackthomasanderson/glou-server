import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({ log: ['error'] });

async function main() {
    const bottle = await prisma.bottles.findFirst({
        where: { label: "Château Margaux" }
    });
    console.log(JSON.stringify(bottle, null, 2));
}

main().finally(() => prisma.$disconnect());
