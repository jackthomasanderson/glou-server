
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    console.log('Migrating existing notifications...');

    // Fix "1 bouteille(s) ont dépassé leur apogée"
    const result1 = await prisma.notifications.updateMany({
        where: {
            title: '1 bouteille(s) ont dépassé leur apogée'
        },
        data: {
            title: '1 bouteille a dépassé son apogée',
            message: 'La bouteille suivante nécessite une attention urgente : '
        }
    });
    console.log(`Updated ${result1.count} critical notifications.`);

    // Fix reminders if any (though they were missing translation before)
    const result2 = await prisma.notifications.updateMany({
        where: {
            title: { startsWith: 'Rappel consommation' }
        },
        data: {
            // Keep existing title but fix formatting if needed
        }
    });
    console.log(`Checked ${result2.count} reminders.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
