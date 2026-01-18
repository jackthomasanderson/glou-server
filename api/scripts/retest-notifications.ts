
import { PrismaClient } from '@prisma/client';
import { AlertService } from '../src/services/alert.service.js';

const prisma = new PrismaClient();
const alertService = new AlertService();

async function main() {
    // 1. Find a user
    const user = await prisma.users.findFirst();
    if (!user) {
        console.error("No user found.");
        return;
    }
    const userId = user.id;

    console.log(`🧹 Cleaning notifications for user: ${userId}`);
    await prisma.notifications.deleteMany({
        where: { user_id: userId }
    });

    console.log(`🔄 Resetting alert status for bottles to force re-notification...`);
    await prisma.bottles.updateMany({
        where: { user_id: userId },
        data: { alert_status: 'none' }
    });

    console.log(`🚀 Triggering refresh...`);
    const result = await alertService.updateBottleAlertStatuses(userId);
    console.log(`✅ Refresh complete:`, result);

    console.log(`\n--- New Notifications in DB ---`);
    const notifications = await prisma.notifications.findMany({
        where: { user_id: userId },
        orderBy: { created_at: 'desc' }
    });

    notifications.forEach(n => {
        console.log(`[${n.type}] Title: ${n.title}`);
        console.log(`  Message: ${n.message}`);
    });
}

main().catch(console.error).finally(() => prisma.$disconnect());
