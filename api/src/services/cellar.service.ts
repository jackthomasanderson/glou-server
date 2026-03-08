import { prisma } from '../lib/prisma';
import { CreateCellarInput, UpdateCellarInput } from '../schemas/cellar.schema';

export class CellarService {
  /**
   * Create a new cellar for a user
   */
  static async createCellar(userId: string, data: CreateCellarInput) {
    return prisma.cellar.create({
      data: {
        ...data,
        userId,
      },
    });
  }

  /**
   * List all cellars for a user
   */
  static async listCellars(userId: string) {
    return prisma.cellar.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get a specific cellar by ID, ensuring it belongs to the user
   */
  static async getCellar(userId: string, id: string) {
    return prisma.cellar.findFirst({
      where: {
        id,
        userId,
      },
    });
  }

  /**
   * Update a cellar
   */
  static async updateCellar(userId: string, id: string, data: UpdateCellarInput) {
    // Ensure ownership before update
    const cellar = await this.getCellar(userId, id);
    if (!cellar) return null;

    return prisma.cellar.update({
      where: { id },
      data,
    });
  }

  /**
   * Delete a cellar
   * Note: This is an actual delete as per requirements, but we should 
   * consider what happens to orphan bottles in the future.
   */
  static async deleteCellar(userId: string, id: string) {
    // Ensure ownership before delete
    const cellar = await this.getCellar(userId, id);
    if (!cellar) return null;

    return prisma.cellar.delete({
      where: { id },
    });
  }
}
