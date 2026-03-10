import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
    await prisma.user.updateMany({ data: { isAdmin: true } });
    console.log("All existing users are now Admins.");
}
main().catch(console.error).finally(() => prisma.$disconnect());
