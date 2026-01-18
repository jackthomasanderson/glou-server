
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function debugNotifications() {
    try {
        console.log('--- DEBUGGING NOTIFICATIONS ---');

        // 1. List Users
        const users = await prisma.users.findMany();
        console.log(`Found ${users.length} users:`);
        users.forEach(u => console.log(`- ${u.username} (${u.id})`));

        if (users.length === 0) {
            console.error('No users found!');
            return;
        }

        const user = users[0]; // Assuming single user driven or first user
        console.log(`\nFocusing on user: ${user.username} (${user.id})`);

        // 2. Check Notifications
        const notifications = await prisma.notifications.findMany({
            where: { user_id: user.id }
        });
        console.log(`Found ${notifications.length} notifications for this user.`);
        notifications.forEach(n => {
            console.log(`[${n.created_at.toISOString()}] Type: ${n.type}, Title: ${n.title}, Read: ${n.read}`);
        });

        // 3. Check Critical Bottles
        const criticalBottles = await prisma.bottles.findMany({
            where: {
                user_id: user.id,
                alert_status: 'critical'
            },
            select: { id: true, label: true, peak_maturity_to: true, alert_status: true }
        });
        console.log(`\nFound ${criticalBottles.length} CRITICAL bottles for this user:`);
        criticalBottles.forEach(b => {
            console.log(`- ${b.label}: Ends ${b.peak_maturity_to}, Status: ${b.alert_status}`);
        });

        // 4. Check Alert Preferences
        const prefs = await prisma.alert_preferences.findUnique({
            where: { user_id: user.id }
        });
        console.log(`\nAlert Preferences:`, prefs);

    } catch (e) {
        console.error('Error:', e);
    } finally {
        await prisma.$disconnect();
    }
}

debugNotifications();
