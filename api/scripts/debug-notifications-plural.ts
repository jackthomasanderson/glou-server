
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    const notifications = await prisma.notifications.findMany({
        orderBy: { created_at: 'desc' },
        take: 10
    });

    console.log('--- Recent Notifications ---');
    notifications.forEach(n => {
        console.log(`[${n.created_at.toISOString()}] ${n.type} | Title: ${n.title}`);
        console.log(`  Message: ${n.message}`);
    });
}

main().catch(console.error).finally(() => prisma.$disconnect());
