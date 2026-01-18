
import { PrismaClient } from '@prisma/client';
import { NotificationService } from '../src/services/notification.service.js';

const prisma = new PrismaClient();
const notificationService = new NotificationService();

async function main() {
    // 1. Find a user
    const user = await prisma.users.findFirst();
    if (!user) return;
    const userId = user.id;

    console.log(`🧹 Cleaning notifications for user: ${userId}`);
    await prisma.notifications.deleteMany({
        where: { user_id: userId }
    });

    console.log(`📢 Sending test notifications...`);

    // Test 1: Single critical bottle
    await notificationService.notifyPeakMaturityAlert(userId, [
        { id: 'test-1', label: 'Bouteille Solo', alertStatus: 'critical' }
    ]);

    // Test 2: Multiple approaching bottles
    await notificationService.notifyPeakMaturityAlert(userId, [
        { id: 'test-2', label: 'Bouteille A', alertStatus: 'approaching' },
        { id: 'test-3', label: 'Bouteille B', alertStatus: 'approaching' }
    ]);

    console.log(`\n--- New Notifications in DB ---`);
    const notifications = await prisma.notifications.findMany({
        where: { user_id: userId },
        orderBy: { created_at: 'asc' }
    });

    notifications.forEach(n => {
        console.log(`[${n.type}] Title: ${n.title}`);
        console.log(`  Message: ${n.message}`);
    });
}

main().catch(console.error).finally(() => prisma.$disconnect());
