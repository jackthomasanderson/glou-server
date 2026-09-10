import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' });
const prisma = new PrismaClient({ adapter });
async function main() {
    await prisma.user.updateMany({ data: { isAdmin: true } });
    console.log("All existing users are now Admins.");
}
main().catch(console.error).finally(() => prisma.$disconnect());
