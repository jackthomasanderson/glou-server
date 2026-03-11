import { prisma } from '../lib/prisma';
import { BulkPresetCreate } from '../schemas/bulk-preset.schema';
import { v4 as uuidv4 } from 'uuid';

export class BulkPresetService {
  async listPresets(userId: string) {
    return prisma.bulkPreset.findMany({
      where: { userId },
      orderBy: { name: 'asc' },
    });
  }

  async createPreset(userId: string, data: BulkPresetCreate) {
    return prisma.bulkPreset.create({
      data: {
        id: uuidv4(),
        userId,
        name: data.name,
        payload: data.payload as any, // Json type
      },
    });
  }

  async deletePreset(userId: string, id: string) {
    return prisma.bulkPreset.delete({
      where: { id, userId },
    });
  }
}

export const bulkPresetService = new BulkPresetService();
