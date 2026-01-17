
import { prisma } from "../lib/prisma.js";
import { v4 } from "uuid";
import * as fs from "fs";

async function main() {
    const userId = v4();
    console.log("Creating ADMIN user " + userId);
    await prisma.users.create({
        data: {
            id: userId,
            username: "repro_admin_" + Date.now(),
            email: "repro_admin_" + Date.now() + "@test.com",
            password_hash: "hash",
            role: "admin", // Testing admin deletion
            alert_preferences: {
                create: {
                    days_before_peak: 30
                }
            },
            two_fa_settings: {
                create: {
                    id: v4(),
                    method: "none"
                }
            },
            consumption_objectives: {
                create: {
                    period: "month",
                    target_count: 10
                }
            },
            notifications: {
                create: {
                    type: "test",
                    title: "Test"
                }
            },
            security_events: {
                create: {
                    id: v4(),
                    event_type: "login"
                }
            }
        }
    });

    const cellarId = v4();
    console.log("Creating cellar " + cellarId);
    await prisma.cellars.create({
        data: {
            id: cellarId,
            user_id: userId,
            name: "Test Cellar",
            cellar_type: "aging",
            bottle_capacity: 100
        }
    });

    const bottleId = v4();
    console.log("Creating bottle " + bottleId);
    await prisma.bottles.create({
        data: {
            id: bottleId,
            user_id: userId,
            cellar_id: cellarId,
            name_edition: "Test Wine",
            category: "wine",
            color: "red",
            vintage_or_none: "2020",
            label: "Test Label"
        }
    });

    // Add a consumption event
    const eventId = v4();
    console.log("Creating consumption event " + eventId);
    await prisma.consumption_events.create({
        data: {
            id: eventId,
            user_id: userId,
            bottle_id: bottleId,
            event_type: "consumed",
            event_date: new Date()
        }
    });

    console.log("Attempting to delete user...");
    try {
        await prisma.users.delete({
            where: { id: userId }
        });
        console.log("User deleted successfully!");
        fs.writeFileSync("repro_result.txt", "SUCCESS: User deleted successfully!");
    } catch (e: any) {
        console.error("Delete failed:", e);
        fs.writeFileSync("repro_result.txt", "FAILURE: " + e.toString() + "\n" + JSON.stringify(e, null, 2));
    }
}

main()
    .catch((e: any) => {
        console.error(e);
        fs.writeFileSync("repro_result.txt", "FATAL: " + e.toString());
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
