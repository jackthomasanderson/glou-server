export interface StorageZone {
  id: string;
  name: string;
  description: string | null;
  capacity: number | null;
  cellarId: string;
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
  _count: {
    items: number;
  };
  children?: StorageZoneWithChildren[];
}

export interface StorageZoneWithChildren extends StorageZone {
  children: StorageZoneWithChildren[];
}

export interface CreateStorageZoneInput {
  name: string;
  description?: string | null;
  capacity?: number | null;
  parentId?: string | null;
}

export type UpdateStorageZoneInput = Partial<CreateStorageZoneInput>;

/**
 * Build a tree from a flat list of zones.
 * Zones without a parentId become root nodes.
 */
export function buildZoneTree(zones: StorageZone[]): StorageZoneWithChildren[] {
  const map = new Map<string, StorageZoneWithChildren>();
  const roots: StorageZoneWithChildren[] = [];

  for (const zone of zones) {
    map.set(zone.id, { ...zone, children: [] });
  }

  for (const zone of zones) {
    const node = map.get(zone.id)!;
    if (zone.parentId && map.has(zone.parentId)) {
      map.get(zone.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

/**
 * Count total items in a zone tree node (zone + all descendants).
 */
export function countZoneItems(zone: StorageZoneWithChildren): number {
  return zone._count.items + zone.children.reduce((sum, child) => sum + countZoneItems(child), 0);
}
