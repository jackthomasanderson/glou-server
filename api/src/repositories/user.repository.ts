import { prisma } from "../lib/prisma.js";
import type { users, Prisma } from "@prisma/client";

/**
 * User Repository
 * Encapsulates all database operations related to users
 */
export class UserRepository {
    /**
     * Create a new user
     */
    async createUser(data: Prisma.usersCreateInput): Promise<users> {
        return await prisma.users.create({
            data,
        });
    }

    /**
     * Get user by ID
     */
    async getUserById(id: string): Promise<users | null> {
        return await prisma.users.findUnique({
            where: { id },
        });
    }

    /**
     * Get user by username
     */
    async getUserByUsername(username: string): Promise<users | null> {
        return await prisma.users.findUnique({
            where: { username },
        });
    }

    /**
     * Get user by email
     */
    async getUserByEmail(email: string): Promise<users | null> {
        return await prisma.users.findUnique({
            where: { email },
        });
    }

    /**
     * Update user
     */
    async updateUser(id: string, data: Prisma.usersUpdateInput): Promise<users> {
        return await prisma.users.update({
            where: { id },
            data,
        });
    }

    /**
     * Delete user
     */
    async deleteUser(id: string): Promise<users> {
        return await prisma.users.delete({
            where: { id },
        });
    }

    /**
     * List all users (admin only)
     */
    async listUsers(): Promise<users[]> {
        return await prisma.users.findMany({
            orderBy: { created_at: "desc" },
        });
    }

    /**
     * Check if any user exists (for first user = admin logic)
     */
    async hasAnyUser(): Promise<boolean> {
        const count = await prisma.users.count();
        return count > 0;
    }
}
