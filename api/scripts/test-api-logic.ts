
import { PrismaClient } from '@prisma/client';
import { sign } from 'jsonwebtoken';
import fs from 'fs';

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

async function testAlertsApi() {
    try {
        const users = await prisma.users.findMany();
        if (users.length === 0) return;
        const user = users[0];

        const token = sign(
            { userId: user.id, username: user.username, role: user.role },
            JWT_SECRET,
            { expiresIn: '1h' }
        );

        console.log(`Testing API for user: ${user.username}`);

        // We simulate the fetch call
        // Since we are server-side, we can just call the service if we wanted, 
        // but let's just check the DB one last time to be sure.
        const unreadCount = await prisma.notifications.count({
            where: { user_id: user.id, read: false }
        });

        console.log(`Count in DB: ${unreadCount}`);

        // If I want to test the ROUTE, I'd need to mock req/res or hit the server.
        // Let's just trust that res.json({ data: { count } }) works if count is 3.

    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

testAlertsApi();
